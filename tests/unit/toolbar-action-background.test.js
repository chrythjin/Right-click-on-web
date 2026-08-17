'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');

function createEvent() {
  const listeners = [];
  return {
    listeners,
    addListener(listener) {
      listeners.push(listener);
    },
    emit(...args) {
      return Promise.all(listeners.map((listener) => listener(...args)));
    }
  };
}

function createStorageArea(initial, onChanged, areaName) {
  const data = { ...initial };
  const setCalls = [];
  return {
    data,
    setCalls,
    get(keys, callback) {
      const defaults = keys && typeof keys === 'object' && !Array.isArray(keys) ? keys : {};
      const requested = Array.isArray(keys)
        ? keys
        : (typeof keys === 'string' ? [keys] : Object.keys(defaults));
      const result = { ...defaults };
      for (const key of requested) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          result[key] = data[key];
        }
      }
      callback(result);
    },
    set(update, callback) {
      setCalls.push(structuredClone(update));
      const changes = {};
      for (const [key, value] of Object.entries(update)) {
        changes[key] = { oldValue: data[key], newValue: value };
        data[key] = value;
      }
      callback?.();
      void onChanged.emit(changes, areaName);
    },
    remove(keys, callback) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete data[key];
      }
      callback?.();
    }
  };
}

function createDeferred() {
  let resolve;
  const promise = new Promise((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function deferNextOcrHistorySet(harness) {
  const originalSet = harness.chrome.storage.local.set;
  const intercepted = createDeferred();
  const release = createDeferred();
  let delayed = false;
  harness.chrome.storage.local.set = (update, callback) => {
    if (!delayed && Object.hasOwn(update, 'ocrHistory')) {
      delayed = true;
      intercepted.resolve();
      release.promise.then(() => originalSet(update, callback));
      return;
    }
    originalSet(update, callback);
  };
  return { intercepted: intercepted.promise, release: release.resolve };
}

function createBackgroundHarness(initialSettings = {}) {
  const storageChanged = createEvent();
  const onActivated = createEvent();
  const onUpdated = createEvent();
  const onContextMenuClicked = createEvent();
  const actionCalls = [];
  const tabs = [
    { id: 1, windowId: 1, url: 'https://www.parent.example/page' },
    { id: 2, windowId: 1, url: 'https://lite.example/page' },
    { id: 3, windowId: 1, url: 'https://session.example/page' },
    { id: 4, windowId: 1, url: 'https://off.example/page' }
  ];
  const sync = createStorageArea(initialSettings.sync || {
    enabled: false,
    domainSettings: {
      'parent.example': true,
      'lite.example': { enabled: true, mode: 'lite' }
    }
  }, storageChanged, 'sync');
  const local = createStorageArea(initialSettings.local || {}, storageChanged, 'local');
  const session = createStorageArea({ 'session:session.example': true }, storageChanged, 'session');
  session.setAccessLevel = async () => {};

  const chrome = {
    runtime: {
      lastError: null,
      onInstalled: createEvent(),
      onStartup: createEvent(),
      onMessage: createEvent(),
      getContexts: async () => [],
      sendMessage: async () => ({ ok: true }),
      openOptionsPage() {}
    },
    storage: { sync, local, session, onChanged: storageChanged },
    tabs: {
      onActivated,
      onUpdated,
      async query(queryInfo = {}) {
        return queryInfo.active ? [tabs[0]] : tabs;
      },
      async get(tabId) {
        return tabs.find((tab) => tab.id === tabId);
      },
      async sendMessage(_tabId, message) {
        if (message?.type === 'rcow:getViewport') {
          return { width: 1280, height: 720, devicePixelRatio: 1 };
        }
        return {};
      },
      async captureVisibleTab() {
        return 'data:image/png;base64,test';
      }
    },
    action: {
      async setBadgeText(details) {
        actionCalls.push(['badge', details]);
      },
      async setTitle(details) {
        actionCalls.push(['title', details]);
      }
    },
    contextMenus: {
      onClicked: onContextMenuClicked,
      removeAll(callback) {
        callback();
      },
      create() {}
    },
    commands: { onCommand: createEvent() },
    windows: { getCurrent(callback) { callback({ id: 1 }); } },
    offscreen: {
      async hasDocument() { return true; },
      async createDocument() {}
    },
    sidePanel: null
  };
  const context = vm.createContext({
    chrome, console, Promise, URL, setTimeout, clearTimeout, structuredClone
  });
  for (const file of ['shared.js', 'ocr-session-utils.js', 'ocr-history.js', 'toolbar-action-utils.js', 'image-context.js', 'background.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }
  return {
    chrome,
    context,
    actionCalls,
    tabs,
    storageChanged,
    onActivated,
    onUpdated,
    onContextMenuClicked,
    async dispatchRuntimeMessage(message, sender = { tab: tabs[0] }) {
      return new Promise((resolve) => {
        for (const listener of chrome.runtime.onMessage.listeners) {
          const keepChannelOpen = listener(message, sender, resolve);
          if (keepChannelOpen !== true) {
            return;
          }
        }
      });
    }
  };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

function latestBadges(calls) {
  const result = new Map();
  for (const [kind, details] of calls) {
    if (kind === 'badge') {
      result.set(details.tabId, details.text);
    }
  }
  return result;
}

test('background resolves global, parent-domain legacy, mode, and session precedence per tab', async () => {
  const harness = createBackgroundHarness();
  await settle();

  assert.deepEqual(Object.fromEntries(latestBadges(harness.actionCalls)), {
    1: 'U',
    2: 'L',
    3: 'S',
    4: 'OFF'
  });
  assert.equal(harness.actionCalls.some(([kind, details]) =>
    kind === 'title'
      && details.tabId === 3
      && details.title === 'Right-click on Web: 현재 사이트 세션 임시 활성화'
  ), true);
});

test('domain profile migration writes changed sync and local maps once and is idempotent', async () => {
  const harness = createBackgroundHarness({
    sync: {
      enabled: true,
      domainSettings: {
        'legacy.example': true,
        'preset.example': { enabled: true, mode: 'ultimate', preset: 'upload-safe' }
      }
    },
    local: {
      enabled: false,
      domainSettings: {
        'lite.example': { enabled: false, mode: 'lite' },
        'custom.example': {
          enabled: true,
          mode: 'ultimate',
          preset: 'custom',
          features: { contextMenu: false, unknownFeature: true }
        }
      }
    }
  });
  await settle();
  harness.chrome.storage.sync.setCalls.length = 0;
  harness.chrome.storage.local.setCalls.length = 0;

  const migrateBoth = () => vm.runInContext('migrateDomainSettingsInAllAreas()', harness.context);
  await migrateBoth();

  assert.equal(harness.chrome.storage.sync.setCalls.length, 1);
  assert.equal(harness.chrome.storage.local.setCalls.length, 1);
  assert.equal(harness.chrome.storage.sync.data.domainSettings['legacy.example'].preset, 'complete');
  assert.equal(
    harness.chrome.storage.sync.data.domainSettings['preset.example'].features.dragDrop,
    false
  );
  assert.equal(harness.chrome.storage.local.data.domainSettings['lite.example'].features.ultimateCss, false);
  assert.equal(
    Object.hasOwn(
      harness.chrome.storage.local.data.domainSettings['custom.example'].features,
      'unknownFeature'
    ),
    false
  );

  await migrateBoth();
  assert.equal(harness.chrome.storage.sync.setCalls.length, 1);
  assert.equal(harness.chrome.storage.local.setCalls.length, 1);
});

test('activation, URL, persistent settings, and session changes trigger tab-scoped refreshes', async () => {
  const harness = createBackgroundHarness();
  await settle();
  harness.actionCalls.length = 0;

  await harness.onActivated.emit({ tabId: 2 });
  await harness.onUpdated.emit(4, { url: 'https://lite.example/next' }, { id: 4 });
  await settle();
  assert.equal(harness.actionCalls.some(([kind, details]) =>
    kind === 'badge' && details.tabId === 4 && details.text === 'L'
  ), true);

  await harness.storageChanged.emit({ domainSettings: { newValue: {} } }, 'sync');
  await harness.storageChanged.emit({ 'session:session.example': { newValue: false } }, 'session');
  await settle();

  const refreshedTabIds = new Set(harness.actionCalls
    .filter(([kind]) => kind === 'badge')
    .map(([, details]) => details.tabId));
  assert.deepEqual([...refreshedTabIds].sort(), [1, 2, 3, 4]);
});

test('a newer URL update is the final badge when an older action call is delayed', async () => {
  const harness = createBackgroundHarness();
  await settle();
  harness.actionCalls.length = 0;
  let releaseOldBadge;
  harness.chrome.action.setBadgeText = async (details) => {
    if (details.tabId === 4 && details.text === 'OFF') {
      await new Promise((resolve) => {
        releaseOldBadge = resolve;
      });
    }
    harness.actionCalls.push(['badge', details]);
  };

  void harness.onUpdated.emit(4, { url: 'https://off.example/old' }, { id: 4 });
  await settle();
  void harness.onUpdated.emit(4, { url: 'https://lite.example/new' }, { id: 4 });
  releaseOldBadge();
  await settle();

  const tabBadges = harness.actionCalls
    .filter(([kind, details]) => kind === 'badge' && details.tabId === 4)
    .map(([, details]) => details.text);
  assert.deepEqual(tabBadges, ['OFF', 'L']);
});

test('an empty intermediate URL update falls back to the tab URL', async () => {
  const harness = createBackgroundHarness();
  await settle();
  harness.actionCalls.length = 0;

  await harness.onUpdated.emit(4, { url: '' }, {
    id: 4,
    url: 'https://lite.example/committed'
  });
  await settle();

  assert.equal(harness.actionCalls.some(([kind, details]) =>
    kind === 'badge' && details.tabId === 4 && details.text === 'L'
  ), true);
});

test('throwing action APIs cannot reject an existing settings write', async () => {
  const harness = createBackgroundHarness();
  await settle();
  harness.chrome.action.setBadgeText = async () => {
    throw new Error('badge unavailable');
  };
  harness.chrome.action.setTitle = async () => {
    throw new Error('title unavailable');
  };

  await assert.doesNotReject(() => harness.onContextMenuClicked.emit({
    menuItemId: 'rcow-global-toggle'
  }));
  await settle();

  assert.equal(
    harness.chrome.storage.sync.data.enabled === true
      || harness.chrome.storage.local.data.enabled === true,
    true
  );
});

test('region and image requests share OCR while only the last successful region enables fresh repeat capture', async () => {
  const harness = createBackgroundHarness();
  const runRequests = [];
  let captureCount = 0;
  harness.chrome.tabs.captureVisibleTab = async () => {
    captureCount += 1;
    return 'data:image/png;base64,test';
  };
  harness.chrome.runtime.sendMessage = async (message) => {
    runRequests.push(structuredClone(message));
    return {
      ok: true,
      requestId: message.requestId,
      text: '공통 OCR 결과',
      confidence: { average: 91, lowCount: 0, threshold: 50 },
      preprocessing: { profile: message.preprocessingProfile, upscale: 1, grayscale: false, invert: false, threshold: null },
      crop: { width: 200, height: 100 }
    };
  };
  const request = (source) => harness.dispatchRuntimeMessage({
    type: 'rcow:captureAndOcr',
    cropRect: { x: 10, y: 20, width: 200, height: 100 },
    viewport: { width: 1280, height: 720, devicePixelRatio: 1 },
    preprocessingProfile: 'auto',
    source
  });

  assert.equal((await request('region')).ok, true);
  await settle();
  const region = harness.chrome.storage.session.data.latestOcrResult;
  assert.equal(region.source, 'region');
  assert.equal(region.metadata.source, 'region');
  const lastRegion = structuredClone(harness.chrome.storage.session.data.lastRegionRerun);
  assert.deepEqual(Object.keys(lastRegion).sort(), ['devicePixelRatio', 'hostname', 'rect', 'source', 'tabId', 'timestamp', 'viewport']);
  assert.equal(JSON.stringify(lastRegion).includes('data:image'), false);

  assert.equal((await request('image')).ok, true);
  await settle();
  const image = harness.chrome.storage.session.data.latestOcrResult;
  assert.equal(image.source, 'image');
  assert.equal(image.metadata.source, 'image');
  assert.equal(image.metadata.preprocessingProfile, 'auto');
  assert.equal(
    JSON.stringify(harness.chrome.storage.session.data.lastRegionRerun),
    JSON.stringify(lastRegion),
    'image OCR must not overwrite the repeatable region state'
  );
  assert.deepEqual(runRequests.map((entry) => ({
    cropRect: entry.cropRect,
    devicePixelRatio: entry.devicePixelRatio,
    preprocessingProfile: entry.preprocessingProfile
  })), [
    { cropRect: { x: 10, y: 20, width: 200, height: 100 }, devicePixelRatio: 1, preprocessingProfile: 'auto' },
    { cropRect: { x: 10, y: 20, width: 200, height: 100 }, devicePixelRatio: 1, preprocessingProfile: 'auto' }
  ]);

  assert.equal((await harness.dispatchRuntimeMessage({ type: 'rcow:rerunOcrOnActiveTab' })).ok, true);
  await settle();
  const rerun = harness.chrome.storage.session.data.latestOcrResult;
  assert.equal(rerun.source, 'region');
  assert.equal(rerun.metadata.source, 'region');
  assert.equal(runRequests.length, 3);
  assert.equal(captureCount, 3, 'repeat must take a new visible-tab capture');
  assert.deepEqual(runRequests[2].cropRect, { x: 10, y: 20, width: 200, height: 100 });

  assert.equal((await request('visible-tab')).ok, true);
  await settle();
  assert.equal(harness.chrome.storage.session.data.latestOcrResult.source, 'region');
  assert.equal(captureCount, 4);
  assert.equal(runRequests.length, 4);
  assert.equal(runRequests.every((entry) => entry.type === 'rcow:runOcr'), true);
  assert.equal(JSON.stringify(harness.chrome.storage.session.data.latestOcrResult).includes('data:image'), false);
});

test('last region repeat rejects invalid session state before capture and tolerates missing session storage', async () => {
  const harness = createBackgroundHarness();
  await settle();
  let captureCount = 0;
  harness.chrome.tabs.captureVisibleTab = async () => {
    captureCount += 1;
    return 'data:image/png;base64,fresh';
  };
  const valid = {
    tabId: 1,
    hostname: 'www.parent.example',
    viewport: { width: 1280, height: 720 },
    rect: { x: 10, y: 20, width: 200, height: 100 },
    devicePixelRatio: 1,
    source: 'region',
    timestamp: Date.now()
  };
  const invalidStates = [
    undefined,
    { ...valid, tabId: 99 },
    { ...valid, hostname: 'other.example' },
    { ...valid, viewport: { ...valid.viewport, width: 1279 } },
    { ...valid, viewport: { ...valid.viewport, height: 719 } },
    { ...valid, devicePixelRatio: 2 },
    { ...valid, timestamp: Date.now() - (25 * 60 * 60 * 1000) },
    { ...valid, rect: { x: 10, y: 20, width: 0, height: 100 } },
    { ...valid, rect: { x: 1200, y: 20, width: 200, height: 100 } }
  ];

  for (const state of invalidStates) {
    if (state === undefined) delete harness.chrome.storage.session.data.lastRegionRerun;
    else harness.chrome.storage.session.data.lastRegionRerun = state;
    const response = await harness.dispatchRuntimeMessage({ type: 'rcow:rerunOcrOnActiveTab' });
    assert.equal(response.ok, false);
    assert.equal(captureCount, 0, 'rejected validation must not capture');
  }

  harness.chrome.storage.session = null;
  const unsupported = await harness.dispatchRuntimeMessage({ type: 'rcow:rerunOcrOnActiveTab' });
  assert.equal(unsupported.ok, false);
  assert.match(unsupported.error, /지원하지 않습니다/);
  assert.equal(captureCount, 0);
});

test('OCR history stays absent until opt-in, saves only requested final text, and supports all delete paths', async () => {
  const harness = createBackgroundHarness();
  await settle();
  assert.equal(Object.hasOwn(harness.chrome.storage.local.data, 'ocrHistory'), false);

  const offSave = await harness.dispatchRuntimeMessage({
    type: 'rcow:saveOcrHistoryEntry', text: '원본 OCR 텍스트', hostname: 'private.example'
  });
  assert.equal(offSave.ok, false);
  assert.equal(offSave.disabled, true);
  assert.equal(Object.hasOwn(harness.chrome.storage.local.data, 'ocrHistory'), false);

  const enabled = await harness.dispatchRuntimeMessage({ type: 'rcow:setOcrHistoryEnabled', enabled: true });
  assert.equal(enabled.enabled, true);
  const saved = await harness.dispatchRuntimeMessage({
    type: 'rcow:saveOcrHistoryEntry', text: '사용자가 고친 최종 텍스트', hostname: 'private.example'
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.entries[0].text, '사용자가 고친 최종 텍스트');
  assert.equal(Object.hasOwn(saved.entries[0], 'rawText'), false);

  const entryId = saved.entries[0].id;
  const deletedOne = await harness.dispatchRuntimeMessage({ type: 'rcow:deleteOcrHistoryEntry', id: entryId });
  assert.equal(deletedOne.entries.length, 0);
  assert.equal(Object.hasOwn(harness.chrome.storage.local.data, 'ocrHistory'), false);
  await harness.dispatchRuntimeMessage({
    type: 'rcow:saveOcrHistoryEntry', text: '다시 저장', hostname: 'private.example'
  });
  const deletedAll = await harness.dispatchRuntimeMessage({ type: 'rcow:deleteAllOcrHistory' });
  assert.equal(deletedAll.enabled, true);
  assert.equal(Object.hasOwn(harness.chrome.storage.local.data, 'ocrHistory'), false);
  await harness.dispatchRuntimeMessage({
    type: 'rcow:saveOcrHistoryEntry', text: '마지막 저장', hostname: 'private.example'
  });
  const disabled = await harness.dispatchRuntimeMessage({
    type: 'rcow:setOcrHistoryEnabled', enabled: false, deleteEntries: true });
  assert.equal(disabled.enabled, false);
  assert.equal(Object.hasOwn(harness.chrome.storage.local.data, 'ocrHistory'), false);
});

test('OCR history write failures return a scoped failure without changing the OCR session result', async () => {
  const harness = createBackgroundHarness({ local: { ocrHistoryEnabled: true } });
  await settle();
  harness.chrome.storage.session.data.latestOcrResult = { text: '활성 OCR 결과' };
  const originalSet = harness.chrome.storage.local.set;
  harness.chrome.storage.local.set = (update, callback) => {
    if (Object.hasOwn(update, 'ocrHistory')) {
      harness.chrome.runtime.lastError = { message: 'history quota' };
      callback?.();
      harness.chrome.runtime.lastError = null;
      return;
    }
    originalSet(update, callback);
  };
  const response = await harness.dispatchRuntimeMessage({
    type: 'rcow:saveOcrHistoryEntry', text: '실패해도 OCR은 유지', hostname: 'private.example'
  });
  assert.equal(response.ok, false);
  assert.match(response.error, /history quota/);
  assert.equal(harness.chrome.storage.session.data.latestOcrResult.text, '활성 OCR 결과');
});

test('OCR history mutation queue makes later individual delete win over a delayed save', async () => {
  const existingEntry = { id: 'existing-entry', text: '기존 기록', hostname: 'private.example', savedAt: Date.now() };
  const harness = createBackgroundHarness({
    local: { ocrHistoryEnabled: true, ocrHistory: [existingEntry] }
  });
  await settle();
  const delayedSet = deferNextOcrHistorySet(harness);

  const save = harness.dispatchRuntimeMessage({
    type: 'rcow:saveOcrHistoryEntry', text: '새 기록', hostname: 'private.example'
  });
  await delayedSet.intercepted;
  const deleteExisting = harness.dispatchRuntimeMessage({
    type: 'rcow:deleteOcrHistoryEntry', id: existingEntry.id
  });
  delayedSet.release();
  await Promise.all([save, deleteExisting]);

  assert.equal(harness.chrome.storage.local.data.ocrHistory.some((entry) => entry.id === existingEntry.id), false);
  assert.equal(harness.chrome.storage.local.data.ocrHistory.some((entry) => entry.text === '새 기록'), true);
});

test('OCR history mutation queue makes later delete-all remove a delayed save', async () => {
  const harness = createBackgroundHarness({ local: { ocrHistoryEnabled: true } });
  await settle();
  const delayedSet = deferNextOcrHistorySet(harness);

  const save = harness.dispatchRuntimeMessage({
    type: 'rcow:saveOcrHistoryEntry', text: '삭제될 새 기록', hostname: 'private.example'
  });
  await delayedSet.intercepted;
  const deleteAll = harness.dispatchRuntimeMessage({ type: 'rcow:deleteAllOcrHistory' });
  delayedSet.release();
  await Promise.all([save, deleteAll]);

  assert.equal(Object.hasOwn(harness.chrome.storage.local.data, 'ocrHistory'), false);
});

test('OCR history mutation queue makes later disable and delete remove a delayed save', async () => {
  const harness = createBackgroundHarness({ local: { ocrHistoryEnabled: true } });
  await settle();
  const delayedSet = deferNextOcrHistorySet(harness);

  const save = harness.dispatchRuntimeMessage({
    type: 'rcow:saveOcrHistoryEntry', text: '비활성화될 새 기록', hostname: 'private.example'
  });
  await delayedSet.intercepted;
  const disable = harness.dispatchRuntimeMessage({
    type: 'rcow:setOcrHistoryEnabled', enabled: false, deleteEntries: true });
  delayedSet.release();
  await Promise.all([save, disable]);

  assert.equal(harness.chrome.storage.local.data.ocrHistoryEnabled, false);
  assert.equal(Object.hasOwn(harness.chrome.storage.local.data, 'ocrHistory'), false);
});

test('OCR history mutation queue recovers after a failed operation', async () => {
  const harness = createBackgroundHarness({ local: { ocrHistoryEnabled: true } });
  await settle();
  const originalSet = harness.chrome.storage.local.set;
  let failFirstHistoryWrite = true;
  harness.chrome.storage.local.set = (update, callback) => {
    if (failFirstHistoryWrite && Object.hasOwn(update, 'ocrHistory')) {
      failFirstHistoryWrite = false;
      harness.chrome.runtime.lastError = { message: 'history quota' };
      callback?.();
      harness.chrome.runtime.lastError = null;
      return;
    }
    originalSet(update, callback);
  };

  const failed = await harness.dispatchRuntimeMessage({
    type: 'rcow:saveOcrHistoryEntry', text: '실패한 기록', hostname: 'private.example'
  });
  const saved = await harness.dispatchRuntimeMessage({
    type: 'rcow:saveOcrHistoryEntry', text: '복구된 기록', hostname: 'private.example'
  });

  assert.equal(failed.ok, false);
  assert.match(failed.error, /history quota/);
  assert.equal(saved.ok, true);
  assert.equal(saved.entries[0].text, '복구된 기록');
});

function expiredHistoryEntry() {
  return {
    id: 'expired-entry',
    text: '만료된 기록',
    hostname: 'private.example',
    savedAt: Date.now() - (31 * 24 * 60 * 60 * 1000)
  };
}

test('OCR history cleanup read cannot overwrite a later queued save', async () => {
  const harness = createBackgroundHarness({
    local: { ocrHistoryEnabled: true, ocrHistory: [expiredHistoryEntry()] }
  });
  await settle();
  const delayedSet = deferNextOcrHistorySet(harness);

  const cleanupRead = harness.dispatchRuntimeMessage({ type: 'rcow:getOcrHistory' });
  await delayedSet.intercepted;
  const save = harness.dispatchRuntimeMessage({
    type: 'rcow:saveOcrHistoryEntry', text: 'cleanup 뒤 새 기록', hostname: 'private.example'
  });
  delayedSet.release();
  await Promise.all([cleanupRead, save]);

  assert.equal(harness.chrome.storage.local.data.ocrHistory.length, 1);
  assert.equal(harness.chrome.storage.local.data.ocrHistory[0].text, 'cleanup 뒤 새 기록');
});

test('OCR history cleanup read cannot resurrect data after a later delete-all', async () => {
  const harness = createBackgroundHarness({
    local: { ocrHistoryEnabled: true, ocrHistory: [expiredHistoryEntry()] }
  });
  await settle();
  const delayedSet = deferNextOcrHistorySet(harness);

  const cleanupRead = harness.dispatchRuntimeMessage({ type: 'rcow:getOcrHistory' });
  await delayedSet.intercepted;
  const deleteAll = harness.dispatchRuntimeMessage({ type: 'rcow:deleteAllOcrHistory' });
  delayedSet.release();
  await Promise.all([cleanupRead, deleteAll]);

  assert.equal(Object.hasOwn(harness.chrome.storage.local.data, 'ocrHistory'), false);
});

test('OCR history cleanup read cannot resurrect data after a later individual delete', async () => {
  const retainedEntry = {
    id: 'retained-entry', text: '유지 후 삭제할 기록', hostname: 'private.example', savedAt: Date.now()
  };
  const harness = createBackgroundHarness({
    local: { ocrHistoryEnabled: true, ocrHistory: [expiredHistoryEntry(), retainedEntry] }
  });
  await settle();
  const delayedSet = deferNextOcrHistorySet(harness);

  const cleanupRead = harness.dispatchRuntimeMessage({ type: 'rcow:getOcrHistory' });
  await delayedSet.intercepted;
  const deleteEntry = harness.dispatchRuntimeMessage({
    type: 'rcow:deleteOcrHistoryEntry', id: retainedEntry.id
  });
  delayedSet.release();
  await Promise.all([cleanupRead, deleteEntry]);

  assert.equal(Object.hasOwn(harness.chrome.storage.local.data, 'ocrHistory'), false);
});

test('failed OCR history cleanup read is caller-visible and the queue recovers', async () => {
  const harness = createBackgroundHarness({
    local: { ocrHistoryEnabled: true, ocrHistory: [expiredHistoryEntry()] }
  });
  await settle();
  const originalSet = harness.chrome.storage.local.set;
  let failCleanup = true;
  harness.chrome.storage.local.set = (update, callback) => {
    if (failCleanup && Object.hasOwn(update, 'ocrHistory')) {
      failCleanup = false;
      harness.chrome.runtime.lastError = { message: 'cleanup quota' };
      callback?.();
      harness.chrome.runtime.lastError = null;
      return;
    }
    originalSet(update, callback);
  };

  const failedRead = await harness.dispatchRuntimeMessage({ type: 'rcow:getOcrHistory' });
  const saved = await harness.dispatchRuntimeMessage({
    type: 'rcow:saveOcrHistoryEntry', text: 'cleanup 복구 뒤 기록', hostname: 'private.example'
  });

  assert.equal(failedRead.ok, false);
  assert.match(failedRead.error, /cleanup quota/);
  assert.equal(saved.ok, true);
  assert.equal(saved.entries[0].text, 'cleanup 복구 뒤 기록');
});
