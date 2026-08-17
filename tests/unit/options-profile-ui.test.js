'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');

function loadShared() {
  const context = vm.createContext({});
  const source = fs.readFileSync(path.join(root, 'shared.js'), 'utf8');
  vm.runInContext(source, context, { filename: 'shared.js' });
  return context.RIGHT_CLICK_ON_WEB_SHARED;
}

function loadOptionsHelpers() {
  const SHARED = loadShared();
  const source = fs.readFileSync(path.join(root, 'options.js'), 'utf8');
  const helpers = [
    'isAllowedFeatureKey',
    'computeOptionsPresetEntry',
    'computeFeatureToggleEntry',
    'computePresetResetEntry',
    'computeProfilePreservingEntry',
    'featureLabelKorean',
    'optionsPresetLabelKorean'
  ];
  const context = vm.createContext({ SHARED });
  for (const name of helpers) {
    const fnSource = extractFunction(source, name);
    vm.runInContext(`${fnSource}; this.${name} = ${name};`, context);
  }
  return {
    isAllowedFeatureKey: context.isAllowedFeatureKey,
    computeOptionsPresetEntry: context.computeOptionsPresetEntry,
    computeFeatureToggleEntry: context.computeFeatureToggleEntry,
    computePresetResetEntry: context.computePresetResetEntry,
    computeProfilePreservingEntry: context.computeProfilePreservingEntry,
    featureLabelKorean: context.featureLabelKorean,
    optionsPresetLabelKorean: context.optionsPresetLabelKorean
  };
}

function loadOcrSourceNoticeRenderer() {
  const source = fs.readFileSync(path.join(root, 'options.js'), 'utf8');
  const renderSource = extractFunction(source, 'renderOcrSourceNotice');
  const notice = {
    textContent: '',
    classList: {
      hidden: true,
      toggle(name, force) {
        if (name === 'is-hidden') this.hidden = force;
      }
    }
  };
  const context = vm.createContext({
    OCR_SESSION: require(path.join(root, 'ocr-session-utils.js')),
    elements: { ocrSourceNotice: notice }
  });
  vm.runInContext(`${renderSource}; this.renderOcrSourceNotice = renderOcrSourceNotice;`, context);
  return { notice, render: context.renderOcrSourceNotice };
}

function loadOcrHistoryProvenanceHarness() {
  const source = fs.readFileSync(path.join(root, 'options.js'), 'utf8');
  const state = {
    ocr: { latestOcrResult: null },
    ocrOriginalText: '',
    ocrEditedText: '',
    ocrDisplayedResult: null,
    ocrIsDirty: false,
    ocrPendingNewResult: null,
    ocrPendingNewResultText: null,
    ocrDismissedResultText: null,
    ocrHistoryEnabled: true,
    ocrHistory: []
  };
  const sentMessages = [];
  const elements = {
    ocrNewResultBanner: { classList: { add() {}, remove() {} } },
    ocrEditedText: { value: '' },
    ocrOriginalText: { textContent: '' },
    ocrEditDirty: { classList: { add() {} } },
    ocrHistoryStatus: { textContent: '' }
  };
  const context = vm.createContext({
    state,
    elements,
    OCR_SESSION: require(path.join(root, 'ocr-session-utils.js')),
    sendOcrHistoryMessage: async (message) => {
      sentMessages.push(message);
      return { ok: true, enabled: true, entries: [] };
    }
  });

  for (const name of ['handleOcrAcceptNew', 'handleOcrHistorySave']) {
    vm.runInContext(extractFunction(source, name), context);
  }

  return {
    state,
    sentMessages,
    accept: context.handleOcrAcceptNew,
    save: context.handleOcrHistorySave
  };
}

function extractFunction(source, name) {
  const asyncPattern = `async function ${name}(`;
  const syncPattern = `function ${name}(`;
  let startIndex = source.indexOf(asyncPattern);
  if (startIndex === -1) {
    startIndex = source.indexOf(syncPattern);
  }
  if (startIndex === -1) {
    throw new Error(`${name} function not found in options.js`);
  }
  let depth = 0;
  let i = startIndex;
  let foundOpen = false;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '{') {
      depth++;
      foundOpen = true;
    } else if (ch === '}') {
      depth--;
      if (foundOpen && depth === 0) {
        return source.slice(startIndex, i + 1);
      }
    }
    i++;
  }
  throw new Error(`${name} function body not properly terminated`);
}

function extractStatement(source, prefix) {
  const startIndex = source.indexOf(prefix);
  if (startIndex === -1) {
    throw new Error(`statement starting with "${prefix}" not found in options.js`);
  }
  let depth = 0;
  let i = startIndex;
  let foundOpen = false;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '{') {
      depth++;
      foundOpen = true;
    } else if (ch === '}') {
      depth--;
      if (foundOpen && depth === 0) {
        let end = i + 1;
        while (end < source.length && source[end] !== '\n') {
          end++;
        }
        return source.slice(startIndex, end);
      }
    }
    i++;
  }
  throw new Error(`statement starting with "${prefix}" not properly terminated`);
}

function extractConst(source, name) {
  const pattern = `const ${name} =`;
  const startIndex = source.indexOf(pattern);
  if (startIndex === -1) {
    throw new Error(`const ${name} not found in options.js`);
  }
  let end = startIndex;
  while (end < source.length && source[end] !== '\n') {
    end++;
  }
  return source.slice(startIndex, end);
}

function loadOperationQueueHarness(options) {
  options = options || {};
  const SHARED = loadShared();
  const source = fs.readFileSync(path.join(root, 'options.js'), 'utf8');

  const lockSource = extractFunction(source, 'withDomainSettingsLock');
  const writeSource = extractStatement(source, 'let writeDomainSettingsTail');
  const updateSource = extractFunction(source, 'updateDomainEntry');
  const removeSource = extractFunction(source, 'removeDomain');
  const globalWriteSource = extractStatement(source, 'let writeGlobalTail');
  const lockNameSource = extractConst(source, 'DOMAIN_SETTINGS_LOCK_NAME');

  let storedDomainSettings = {};
  let storedEnabled = true;
  let writeDelay = 0;
  let lastFallback = false;
  let shouldFail = false;
  let failOnce = false;
  let lockLog = [];
  let lockRejectMode = false;
  let renderSyncUsageCalls = 0;

  const state = { domainSettings: {}, lastWriteFallback: false, rowStatus: {}, syncAvailable: false, syncBytesInUse: 0 };
  const chrome = {
    storage: {
      local: { _area: 'local' },
      sync: { _area: 'sync' }
    }
  };

  const mockSHARED = {
    STORAGE_DEFAULTS: SHARED.STORAGE_DEFAULTS,
    parseDomainSetting: SHARED.parseDomainSetting,
    resolveSettings: async () => {
      if (writeDelay > 0) await new Promise(r => setTimeout(r, writeDelay));
      return { enabled: storedEnabled, domainSettings: { ...storedDomainSettings } };
    },
    safeSyncSet: async (obj) => {
      if (shouldFail || failOnce) {
        failOnce = false;
        throw new Error('simulated storage failure');
      }
      if (obj.domainSettings) {
        storedDomainSettings = { ...obj.domainSettings };
      }
      if (Object.prototype.hasOwnProperty.call(obj, 'enabled')) {
        storedEnabled = obj.enabled;
      }
      return { fallback: lastFallback };
    }
  };

  const navigator = options.simulateLocks
    ? {
        locks: {
          request: (name, callback) => {
            lockLog.push(name);
            if (lockRejectMode) {
              return Promise.reject(new Error('lock request denied'));
            }
            return Promise.resolve(callback());
          }
        }
      }
    : undefined;

  const elements = { syncUsage: { textContent: '' } };

  const context = vm.createContext({
    SHARED: mockSHARED,
    state,
    chrome,
    navigator,
    elements,
    console: { error: () => {} },
    Promise,
    setTimeout,
    Date,
    window: { confirm: () => true }
  });

  const renderSyncUsageSource = extractFunction(source, 'renderSyncUsage');
  vm.runInContext(renderSyncUsageSource, context);
  const originalRenderSyncUsage = context.renderSyncUsage;
  context.renderSyncUsage = function() {
    renderSyncUsageCalls++;
    return originalRenderSyncUsage.call(context);
  };

  vm.runInContext(lockNameSource, context);
  vm.runInContext(lockSource, context);
  vm.runInContext(writeSource, context);
  vm.runInContext(updateSource, context);
  vm.runInContext(removeSource, context);
  vm.runInContext(globalWriteSource, context);

  return {
    writeDomainSettings: context.writeDomainSettings,
    updateDomainEntry: context.updateDomainEntry,
    removeDomain: context.removeDomain,
    writeGlobalEnabled: context.writeGlobalEnabled,
    getStored: () => storedDomainSettings,
    getStoredEnabled: () => storedEnabled,
    setWriteDelay: (ms) => { writeDelay = ms; },
    setFallback: (v) => { lastFallback = v; },
    setShouldFail: (v) => { shouldFail = v; },
    setFailOnce: () => { failOnce = true; },
    setLockReject: (v) => { lockRejectMode = v; },
    getLockLog: () => lockLog,
    getState: () => state,
    getRenderSyncUsageCalls: () => renderSyncUsageCalls,
    getSyncUsageText: () => elements.syncUsage.textContent,
    reset: () => {
      storedDomainSettings = {};
      storedEnabled = true;
      writeDelay = 0;
      lastFallback = false;
      shouldFail = false;
      failOnce = false;
      lockRejectMode = false;
      lockLog = [];
      renderSyncUsageCalls = 0;
    }
  };
}

const SHARED = loadShared();
const helpers = loadOptionsHelpers();

test('isAllowedFeatureKey: accepts all 9 canonical feature keys', () => {
  for (const key of SHARED.FEATURE_KEYS) {
    assert.strictEqual(helpers.isAllowedFeatureKey(key, SHARED), true, `key ${key} should be allowed`);
  }
});

test('OCR source notice is visible only for canonical image results', () => {
  const renderer = loadOcrSourceNoticeRenderer();

  renderer.render('image');
  assert.equal(renderer.notice.classList.hidden, false);
  assert.match(renderer.notice.textContent, /현재 화면에 보이는 이미지 부분/);

  renderer.render('region');
  assert.equal(renderer.notice.classList.hidden, true);
  assert.equal(renderer.notice.textContent, '');

  renderer.render('visible-tab');
  assert.equal(renderer.notice.classList.hidden, true);
  assert.equal(renderer.notice.textContent, '');
});

test('OCR history provenance follows the accepted textarea result, not a pending latest result', async () => {
  const harness = loadOcrHistoryProvenanceHarness();
  const resultA = { text: '결과 A', metadata: { hostname: 'a.example' } };
  const resultB = { text: '결과 B', metadata: { hostname: 'b.example' } };

  harness.state.ocrOriginalText = resultA.text;
  harness.state.ocrEditedText = '사용자가 편집한 A';
  harness.state.ocrDisplayedResult = resultA;
  harness.state.ocrIsDirty = true;
  harness.state.ocr.latestOcrResult = resultB;
  harness.state.ocrPendingNewResult = resultB;
  harness.state.ocrPendingNewResultText = resultB.text;

  await harness.save();
  assert.equal(harness.sentMessages[0].type, 'rcow:saveOcrHistoryEntry');
  assert.equal(harness.sentMessages[0].text, '사용자가 편집한 A');
  assert.equal(harness.sentMessages[0].hostname, 'a.example');

  harness.accept();
  assert.strictEqual(harness.state.ocrDisplayedResult, resultB);
  assert.equal(harness.state.ocrEditedText, resultB.text);

  await harness.save();
  assert.equal(harness.sentMessages[1].type, 'rcow:saveOcrHistoryEntry');
  assert.equal(harness.sentMessages[1].text, '결과 B');
  assert.equal(harness.sentMessages[1].hostname, 'b.example');
});

test('isAllowedFeatureKey: rejects unknown feature key', () => {
  assert.strictEqual(helpers.isAllowedFeatureKey('unknownFeature', SHARED), false);
  assert.strictEqual(helpers.isAllowedFeatureKey('__proto__', SHARED), false);
  assert.strictEqual(helpers.isAllowedFeatureKey('', SHARED), false);
});

test('computeOptionsPresetEntry: null entry stores full canonical snapshot with complete preset', () => {
  const entry = helpers.computeOptionsPresetEntry(null, SHARED.PRESET_COMPLETE, SHARED);
  assert.strictEqual(entry.enabled, true);
  assert.strictEqual(entry.mode, SHARED.DEFAULT_MODE);
  assert.strictEqual(entry.preset, SHARED.PRESET_COMPLETE);
  assert.deepEqual(entry.features, SHARED.PRESET_FEATURES[SHARED.PRESET_COMPLETE]);
});

test('computeOptionsPresetEntry: null entry with safe preset stores full canonical snapshot', () => {
  const entry = helpers.computeOptionsPresetEntry(null, SHARED.PRESET_SAFE, SHARED);
  assert.strictEqual(entry.preset, SHARED.PRESET_SAFE);
  assert.deepEqual(entry.features, SHARED.PRESET_FEATURES[SHARED.PRESET_SAFE]);
});

test('computeOptionsPresetEntry: null entry with selection preset stores full canonical snapshot', () => {
  const entry = helpers.computeOptionsPresetEntry(null, SHARED.PRESET_SELECTION, SHARED);
  assert.strictEqual(entry.preset, SHARED.PRESET_SELECTION);
  assert.deepEqual(entry.features, SHARED.PRESET_FEATURES[SHARED.PRESET_SELECTION]);
});

test('computeOptionsPresetEntry: null entry with media-safe preset stores full canonical snapshot', () => {
  const entry = helpers.computeOptionsPresetEntry(null, SHARED.PRESET_MEDIA_SAFE, SHARED);
  assert.strictEqual(entry.preset, SHARED.PRESET_MEDIA_SAFE);
  assert.deepEqual(entry.features, SHARED.PRESET_FEATURES[SHARED.PRESET_MEDIA_SAFE]);
});

test('computeOptionsPresetEntry: existing entry preserves enabled and mode, replaces preset and features', () => {
  const current = { enabled: false, mode: 'lite', preset: 'complete' };
  const entry = helpers.computeOptionsPresetEntry(current, SHARED.PRESET_SAFE, SHARED);
  assert.strictEqual(entry.enabled, false);
  assert.strictEqual(entry.mode, 'lite');
  assert.strictEqual(entry.preset, SHARED.PRESET_SAFE);
  assert.deepEqual(JSON.parse(JSON.stringify(entry.features)), {
    ...SHARED.PRESET_FEATURES[SHARED.PRESET_SAFE],
    ultimateCss: false
  });
});

test('computeOptionsPresetEntry: all 9 feature booleans present in stored entry', () => {
  const entry = helpers.computeOptionsPresetEntry(null, SHARED.PRESET_UPLOAD_SAFE, SHARED);
  for (const key of SHARED.FEATURE_KEYS) {
    assert.ok(typeof entry.features[key] === 'boolean', `feature ${key} must be boolean`);
  }
  assert.strictEqual(Object.keys(entry.features).length, SHARED.FEATURE_KEYS.length);
});

test('computeFeatureToggleEntry: toggling one feature sets preset to custom and preserves others', () => {
  const current = { enabled: true, mode: 'ultimate', preset: 'complete' };
  const entry = helpers.computeFeatureToggleEntry(current, 'dragDrop', false, SHARED);
  assert.strictEqual(entry.preset, SHARED.PRESET_CUSTOM);
  assert.strictEqual(entry.features.dragDrop, false);
  assert.strictEqual(entry.features.contextMenu, true);
  assert.strictEqual(entry.features.selection, true);
  assert.strictEqual(entry.features.ultimateCss, true);
});

test('computeFeatureToggleEntry: toggling feature on a safe preset starts from safe snapshot', () => {
  const current = { enabled: true, mode: 'ultimate', preset: 'safe' };
  const entry = helpers.computeFeatureToggleEntry(current, 'dragStart', true, SHARED);
  assert.strictEqual(entry.preset, SHARED.PRESET_CUSTOM);
  assert.strictEqual(entry.features.dragStart, true);
  assert.strictEqual(entry.features.dragDrop, false);
  assert.strictEqual(entry.features.overlayCleanup, false);
});

test('computeFeatureToggleEntry: toggling from custom preserves other custom features', () => {
  const customFeatures = { contextMenu: true, selection: false, copyShortcuts: true, dragStart: false, dragDrop: false, overlayCleanup: false, printUnhide: false, shadowDom: false, ultimateCss: true };
  const current = { enabled: true, mode: 'ultimate', preset: 'custom', features: customFeatures };
  const entry = helpers.computeFeatureToggleEntry(current, 'selection', true, SHARED);
  assert.strictEqual(entry.preset, SHARED.PRESET_CUSTOM);
  assert.strictEqual(entry.features.selection, true);
  assert.strictEqual(entry.features.dragDrop, false);
  assert.strictEqual(entry.features.ultimateCss, true);
});

test('computeFeatureToggleEntry: all 9 feature booleans present after toggle', () => {
  const current = { enabled: true, mode: 'ultimate', preset: 'complete' };
  const entry = helpers.computeFeatureToggleEntry(current, 'shadowDom', false, SHARED);
  for (const key of SHARED.FEATURE_KEYS) {
    assert.ok(typeof entry.features[key] === 'boolean', `feature ${key} must be boolean`);
  }
  assert.strictEqual(Object.keys(entry.features).length, SHARED.FEATURE_KEYS.length);
});

test('computeFeatureToggleEntry: null entry creates custom with toggled feature', () => {
  const entry = helpers.computeFeatureToggleEntry(null, 'printUnhide', false, SHARED);
  assert.strictEqual(entry.enabled, true);
  assert.strictEqual(entry.mode, SHARED.DEFAULT_MODE);
  assert.strictEqual(entry.preset, SHARED.PRESET_CUSTOM);
  assert.strictEqual(entry.features.printUnhide, false);
  assert.strictEqual(entry.features.contextMenu, true);
});

test('computePresetResetEntry: resets custom back to complete canonical snapshot', () => {
  const customFeatures = { contextMenu: true, selection: false, copyShortcuts: true, dragStart: false, dragDrop: false, overlayCleanup: false, printUnhide: false, shadowDom: false, ultimateCss: true };
  const current = { enabled: true, mode: 'ultimate', preset: 'custom', features: customFeatures };
  const entry = helpers.computePresetResetEntry(current, SHARED.PRESET_COMPLETE, SHARED);
  assert.strictEqual(entry.preset, SHARED.PRESET_COMPLETE);
  assert.deepEqual(entry.features, SHARED.PRESET_FEATURES[SHARED.PRESET_COMPLETE]);
  assert.strictEqual(entry.features.selection, true);
  assert.strictEqual(entry.features.dragDrop, true);
});

test('computePresetResetEntry: resets custom back to safe canonical snapshot', () => {
  const current = { enabled: true, mode: 'ultimate', preset: 'custom', features: { contextMenu: true, selection: false } };
  const entry = helpers.computePresetResetEntry(current, SHARED.PRESET_SAFE, SHARED);
  assert.strictEqual(entry.preset, SHARED.PRESET_SAFE);
  assert.deepEqual(entry.features, SHARED.PRESET_FEATURES[SHARED.PRESET_SAFE]);
  assert.strictEqual(entry.features.dragStart, false);
  assert.strictEqual(entry.features.dragDrop, false);
});

test('computePresetResetEntry: preserves enabled and mode from existing entry', () => {
  const current = { enabled: false, mode: 'lite', preset: 'custom', features: { selection: false } };
  const entry = helpers.computePresetResetEntry(current, SHARED.PRESET_UPLOAD_SAFE, SHARED);
  assert.strictEqual(entry.enabled, false);
  assert.strictEqual(entry.mode, 'lite');
  assert.strictEqual(entry.preset, SHARED.PRESET_UPLOAD_SAFE);
  assert.deepEqual(JSON.parse(JSON.stringify(entry.features)), {
    ...SHARED.PRESET_FEATURES[SHARED.PRESET_UPLOAD_SAFE],
    ultimateCss: false
  });
});

test('computePresetResetEntry: null entry creates new with preset and default mode', () => {
  const entry = helpers.computePresetResetEntry(null, SHARED.PRESET_SELECTION, SHARED);
  assert.strictEqual(entry.enabled, true);
  assert.strictEqual(entry.mode, SHARED.DEFAULT_MODE);
  assert.strictEqual(entry.preset, SHARED.PRESET_SELECTION);
  assert.deepEqual(entry.features, SHARED.PRESET_FEATURES[SHARED.PRESET_SELECTION]);
});

test('computeProfilePreservingEntry: toggle enabled preserves existing preset and features', () => {
  const current = { enabled: true, mode: 'ultimate', preset: 'upload-safe' };
  const entry = helpers.computeProfilePreservingEntry(current, { enabled: false }, SHARED);
  assert.strictEqual(entry.enabled, false);
  assert.strictEqual(entry.mode, 'ultimate');
  assert.strictEqual(entry.preset, SHARED.PRESET_UPLOAD_SAFE);
  assert.deepEqual(entry.features, SHARED.PRESET_FEATURES[SHARED.PRESET_UPLOAD_SAFE]);
});

test('computeProfilePreservingEntry: mode change preserves existing preset and features', () => {
  const current = { enabled: true, mode: 'ultimate', preset: 'safe' };
  const entry = helpers.computeProfilePreservingEntry(current, { mode: 'lite' }, SHARED);
  assert.strictEqual(entry.enabled, true);
  assert.strictEqual(entry.mode, 'lite');
  assert.strictEqual(entry.preset, SHARED.PRESET_SAFE);
  assert.deepEqual(JSON.parse(JSON.stringify(entry.features)), {
    ...SHARED.PRESET_FEATURES[SHARED.PRESET_SAFE],
    ultimateCss: false
  });
});

test('computeProfilePreservingEntry: creating from null preserves default complete profile', () => {
  const entry = helpers.computeProfilePreservingEntry(null, { enabled: true, mode: 'ultimate' }, SHARED);
  assert.strictEqual(entry.enabled, true);
  assert.strictEqual(entry.mode, 'ultimate');
  assert.strictEqual(entry.preset, SHARED.PRESET_COMPLETE);
  assert.deepEqual(entry.features, SHARED.PRESET_FEATURES[SHARED.PRESET_COMPLETE]);
});

test('computeProfilePreservingEntry: creating from parent with custom preset preserves custom', () => {
  const parent = { enabled: true, mode: 'ultimate', preset: 'custom', features: { contextMenu: true, selection: false, copyShortcuts: true, dragStart: false, dragDrop: false, overlayCleanup: false, printUnhide: false, shadowDom: false, ultimateCss: true } };
  const entry = helpers.computeProfilePreservingEntry(parent, { enabled: true }, SHARED);
  assert.strictEqual(entry.preset, SHARED.PRESET_CUSTOM);
  assert.strictEqual(entry.features.selection, false);
  assert.strictEqual(entry.features.dragDrop, false);
});

test('featureLabelKorean: maps all 9 feature keys to Korean labels', () => {
  assert.strictEqual(helpers.featureLabelKorean('contextMenu'), '우클릭 메뉴');
  assert.strictEqual(helpers.featureLabelKorean('selection'), '텍스트 선택');
  assert.strictEqual(helpers.featureLabelKorean('copyShortcuts'), '복사 단축키');
  assert.strictEqual(helpers.featureLabelKorean('dragStart'), '드래그 시작');
  assert.strictEqual(helpers.featureLabelKorean('dragDrop'), '드래그 드롭');
  assert.strictEqual(helpers.featureLabelKorean('overlayCleanup'), '오버레이 정리');
  assert.strictEqual(helpers.featureLabelKorean('printUnhide'), '인쇄 숨김 해제');
  assert.strictEqual(helpers.featureLabelKorean('shadowDom'), '섀도 DOM');
  assert.strictEqual(helpers.featureLabelKorean('ultimateCss'), 'Ultimate CSS');
});

test('featureLabelKorean: unknown key returns the key itself', () => {
  assert.strictEqual(helpers.featureLabelKorean('unknown'), 'unknown');
});

test('optionsPresetLabelKorean: maps all 6 presets to Korean labels', () => {
  assert.strictEqual(helpers.optionsPresetLabelKorean('safe'), '안전');
  assert.strictEqual(helpers.optionsPresetLabelKorean('selection'), '선택 (고급)');
  assert.strictEqual(helpers.optionsPresetLabelKorean('complete'), '완전');
  assert.strictEqual(helpers.optionsPresetLabelKorean('upload-safe'), '업로드 보호');
  assert.strictEqual(helpers.optionsPresetLabelKorean('media-safe'), '미디어 보호 (고급)');
  assert.strictEqual(helpers.optionsPresetLabelKorean('custom'), '사용자 정의');
});

test('optionsPresetLabelKorean: unknown preset returns the id itself', () => {
  assert.strictEqual(helpers.optionsPresetLabelKorean('unknown'), 'unknown');
});

test('operation queue: rapid sequential feature toggles preserve every preceding toggle', async () => {
  const harness = loadOperationQueueHarness();
  const hostname = 'example.com';

  await harness.updateDomainEntry(hostname, (current) => helpers.computeOptionsPresetEntry(current, SHARED.PRESET_COMPLETE, SHARED));

  harness.setWriteDelay(10);

  const p1 = harness.updateDomainEntry(hostname, (current) => helpers.computeFeatureToggleEntry(current, 'dragDrop', false, SHARED));
  const p2 = harness.updateDomainEntry(hostname, (current) => helpers.computeFeatureToggleEntry(current, 'selection', false, SHARED));

  await Promise.all([p1, p2]);

  const stored = harness.getStored()[hostname];
  assert.strictEqual(stored.preset, SHARED.PRESET_CUSTOM, 'preset should be custom after feature toggle');
  assert.strictEqual(stored.features.dragDrop, false, 'first toggle (dragDrop=false) must be preserved');
  assert.strictEqual(stored.features.selection, false, 'second toggle (selection=false) must be preserved');
  assert.strictEqual(stored.features.contextMenu, true, 'untouched feature must remain true');
});

test('operation queue: failure-then-success — second write executes after first rejects', async () => {
  const harness = loadOperationQueueHarness();
  const hostname = 'example.com';

  harness.setFailOnce();
  harness.setWriteDelay(5);

  const p1 = harness.updateDomainEntry(hostname, (current) => helpers.computeOptionsPresetEntry(current, SHARED.PRESET_SAFE, SHARED));
  const p2 = harness.updateDomainEntry(hostname, (current) => helpers.computeOptionsPresetEntry(current, SHARED.PRESET_COMPLETE, SHARED));

  await assert.rejects(() => p1, /simulated storage failure/);
  await p2;

  const stored = harness.getStored()[hostname];
  assert.ok(stored, 'second write must succeed after first rejected');
  assert.strictEqual(stored.preset, SHARED.PRESET_COMPLETE, 'second write result must be present');
});

test('operation queue: interleaved hostname writes do not lose siblings', async () => {
  const harness = loadOperationQueueHarness();
  harness.setWriteDelay(5);

  const p1 = harness.updateDomainEntry('a.com', (current) => helpers.computeOptionsPresetEntry(current, SHARED.PRESET_SAFE, SHARED));
  const p2 = harness.updateDomainEntry('b.com', (current) => helpers.computeOptionsPresetEntry(current, SHARED.PRESET_UPLOAD_SAFE, SHARED));
  const p3 = harness.updateDomainEntry('a.com', (current) => helpers.computeOptionsPresetEntry(current, SHARED.PRESET_COMPLETE, SHARED));

  await Promise.all([p1, p2, p3]);

  const stored = harness.getStored();
  assert.strictEqual(stored['a.com'].preset, SHARED.PRESET_COMPLETE, 'a.com should be complete (last write)');
  assert.strictEqual(stored['b.com'].preset, SHARED.PRESET_UPLOAD_SAFE, 'b.com should be preserved as upload-safe');
});

test('operation queue: same-domain concurrent edits follow last-write-wins deterministic policy', async () => {
  const harness = loadOperationQueueHarness();
  harness.setWriteDelay(5);
  const hostname = 'example.com';

  const p1 = harness.updateDomainEntry(hostname, (current) => helpers.computeFeatureToggleEntry(current, 'dragDrop', false, SHARED));
  const p2 = harness.updateDomainEntry(hostname, (current) => helpers.computeOptionsPresetEntry(current, SHARED.PRESET_SAFE, SHARED));

  await Promise.all([p1, p2]);

  const stored = harness.getStored()[hostname];
  assert.strictEqual(stored.preset, SHARED.PRESET_SAFE, 'last write wins — preset should be safe');
  assert.deepEqual(stored.features, SHARED.PRESET_FEATURES[SHARED.PRESET_SAFE]);
});

test('operation queue: quota fallback sets lastWriteFallback flag', async () => {
  const harness = loadOperationQueueHarness();
  harness.setFallback(true);
  const hostname = 'example.com';

  await harness.updateDomainEntry(hostname, (current) => helpers.computeOptionsPresetEntry(current, SHARED.PRESET_COMPLETE, SHARED));

  const stored = harness.getStored();
  assert.strictEqual(stored[hostname].preset, SHARED.PRESET_COMPLETE, 'entry should still be stored via fallback area');
  assert.strictEqual(harness.getState().lastWriteFallback, true, 'lastWriteFallback flag must be set');
});

test('operation queue: Web Locks are requested when navigator.locks is available', async () => {
  const harness = loadOperationQueueHarness({ simulateLocks: true });
  const hostname = 'example.com';

  await harness.updateDomainEntry(hostname, (current) => helpers.computeOptionsPresetEntry(current, SHARED.PRESET_COMPLETE, SHARED));

  const lockLog = harness.getLockLog();
  assert.ok(lockLog.length > 0, 'navigator.locks.request must be called');
  assert.strictEqual(lockLog[0], 'rcow-domain-settings-write', 'lock name must match extension-wide constant');
});

test('operation queue: removeDomain deletes complete domain entry via actual product path', async () => {
  const harness = loadOperationQueueHarness();
  const hostname = 'delete-me.com';

  await harness.updateDomainEntry(hostname, (current) => helpers.computeOptionsPresetEntry(current, SHARED.PRESET_COMPLETE, SHARED));
  assert.ok(harness.getStored()[hostname], 'entry should exist before delete');

  await harness.removeDomain(hostname);
  assert.ok(!harness.getStored()[hostname], 'domain entry should be fully deleted from storage');
});

test('operation queue: removeDomain failure does not poison queue — subsequent write succeeds', async () => {
  const harness = loadOperationQueueHarness();
  const hostname = 'example.com';

  harness.setFailOnce();
  await assert.rejects(() => harness.removeDomain(hostname), /simulated storage failure/);

  await harness.updateDomainEntry(hostname, (current) => helpers.computeOptionsPresetEntry(current, SHARED.PRESET_SAFE, SHARED));
  assert.strictEqual(harness.getStored()[hostname].preset, SHARED.PRESET_SAFE, 'write after failed delete must succeed');
});

test('operation queue: writeGlobalEnabled persists and survives tail recovery', async () => {
  const harness = loadOperationQueueHarness();

  harness.setFailOnce();
  await assert.rejects(() => harness.writeGlobalEnabled(false), /simulated storage failure/);

  await harness.writeGlobalEnabled(true);
  assert.strictEqual(harness.getStoredEnabled(), true, 'second global write must succeed after first rejected');
});

test('parseDomainSetting round-trips computeOptionsPresetEntry output for all presets', () => {
  for (const presetId of [SHARED.PRESET_SAFE, SHARED.PRESET_SELECTION, SHARED.PRESET_COMPLETE, SHARED.PRESET_UPLOAD_SAFE, SHARED.PRESET_MEDIA_SAFE]) {
    const entry = helpers.computeOptionsPresetEntry(null, presetId, SHARED);
    const parsed = SHARED.parseDomainSetting(entry);
    assert.strictEqual(parsed.preset, presetId, `preset ${presetId} should round-trip`);
    assert.deepEqual(parsed.features, SHARED.PRESET_FEATURES[presetId]);
    assert.strictEqual(Object.keys(parsed.features).length, SHARED.FEATURE_KEYS.length);
  }
});

test('parseDomainSetting round-trips computeFeatureToggleEntry output as custom', () => {
  const current = { enabled: true, mode: 'ultimate', preset: 'complete' };
  const entry = helpers.computeFeatureToggleEntry(current, 'dragDrop', false, SHARED);
  const parsed = SHARED.parseDomainSetting(entry);
  assert.strictEqual(parsed.preset, SHARED.PRESET_CUSTOM);
  assert.strictEqual(parsed.features.dragDrop, false);
  assert.strictEqual(parsed.features.contextMenu, true);
});

test('parseDomainSetting round-trips computePresetResetEntry output', () => {
  const customFeatures = { contextMenu: true, selection: false, copyShortcuts: true, dragStart: false, dragDrop: false, overlayCleanup: false, printUnhide: false, shadowDom: false, ultimateCss: true };
  const current = { enabled: true, mode: 'ultimate', preset: 'custom', features: customFeatures };
  const entry = helpers.computePresetResetEntry(current, SHARED.PRESET_COMPLETE, SHARED);
  const parsed = SHARED.parseDomainSetting(entry);
  assert.strictEqual(parsed.preset, SHARED.PRESET_COMPLETE);
  assert.deepEqual(parsed.features, SHARED.PRESET_FEATURES[SHARED.PRESET_COMPLETE]);
});

test('parseDomainSetting round-trips computeProfilePreservingEntry output preserving custom features', () => {
  const parent = { enabled: true, mode: 'ultimate', preset: 'custom', features: { contextMenu: true, selection: false, copyShortcuts: true, dragStart: false, dragDrop: false, overlayCleanup: false, printUnhide: false, shadowDom: false, ultimateCss: true } };
  const entry = helpers.computeProfilePreservingEntry(parent, { enabled: false }, SHARED);
  const parsed = SHARED.parseDomainSetting(entry);
  assert.strictEqual(parsed.preset, SHARED.PRESET_CUSTOM);
  assert.strictEqual(parsed.enabled, false);
  assert.strictEqual(parsed.features.selection, false);
  assert.strictEqual(parsed.features.dragDrop, false);
});

test('preset to custom transition: feature toggle on a preset entry switches to custom', () => {
  const current = { enabled: true, mode: 'ultimate', preset: 'safe' };
  const entry = helpers.computeFeatureToggleEntry(current, 'overlayCleanup', true, SHARED);
  assert.strictEqual(entry.preset, SHARED.PRESET_CUSTOM);
  assert.strictEqual(entry.features.overlayCleanup, true);
  assert.strictEqual(entry.features.dragStart, false, 'safe preset dragStart=false should be preserved');
  assert.strictEqual(entry.features.dragDrop, false, 'safe preset dragDrop=false should be preserved');
});

test('full nine-key snapshot: computeOptionsPresetEntry includes all 9 feature booleans', () => {
  const entry = helpers.computeOptionsPresetEntry(null, SHARED.PRESET_MEDIA_SAFE, SHARED);
  assert.strictEqual(Object.keys(entry.features).length, 9);
  for (const key of SHARED.FEATURE_KEYS) {
    assert.ok(Object.prototype.hasOwnProperty.call(entry.features, key), `feature ${key} must be present`);
    assert.strictEqual(typeof entry.features[key], 'boolean');
  }
});

test('full nine-key snapshot: computeFeatureToggleEntry includes all 9 feature booleans', () => {
  const entry = helpers.computeFeatureToggleEntry(null, 'contextMenu', false, SHARED);
  assert.strictEqual(Object.keys(entry.features).length, 9);
  for (const key of SHARED.FEATURE_KEYS) {
    assert.ok(Object.prototype.hasOwnProperty.call(entry.features, key), `feature ${key} must be present`);
  }
});

test('allowlist rejection: computeFeatureToggleEntry ignores non-allowlisted feature key', () => {
  const current = { enabled: true, mode: 'ultimate', preset: 'complete' };
  const entry = helpers.computeFeatureToggleEntry(current, 'maliciousKey', true, SHARED);
  assert.strictEqual(entry.preset, SHARED.PRESET_CUSTOM);
  assert.ok(!Object.prototype.hasOwnProperty.call(entry.features, 'maliciousKey'), 'non-allowlisted key must not be added');
  assert.strictEqual(Object.keys(entry.features).length, SHARED.FEATURE_KEYS.length);
});

test('allowlist rejection: isAllowedFeatureKey rejects __proto__', () => {
  assert.strictEqual(helpers.isAllowedFeatureKey('__proto__', SHARED), false);
  assert.strictEqual(helpers.isAllowedFeatureKey('constructor', SHARED), false);
  assert.strictEqual(helpers.isAllowedFeatureKey('toString', SHARED), false);
});

test('two-context lock harness: concurrent options-tab and side-panel different-domain writes preserve both siblings', async () => {
  const SHARED = loadShared();
  const sharedStore = { domainSettings: {}, enabled: true };
  let writeDelay = 5;
  let lockQueue = Promise.resolve();
  let lockLog = [];

  function makeContext() {
    const state = { domainSettings: {}, lastWriteFallback: false, rowStatus: {}, syncAvailable: false, syncBytesInUse: 0 };
    const chrome = { storage: { local: { _area: 'local' }, sync: { _area: 'sync' } } };
    const elements = { syncUsage: { textContent: '' } };
    const mockSHARED = {
      STORAGE_DEFAULTS: SHARED.STORAGE_DEFAULTS,
      parseDomainSetting: SHARED.parseDomainSetting,
      resolveSettings: async () => {
        if (writeDelay > 0) await new Promise(r => setTimeout(r, writeDelay));
        return { enabled: sharedStore.enabled, domainSettings: { ...sharedStore.domainSettings } };
      },
      safeSyncSet: async (obj) => {
        if (obj.domainSettings) {
          sharedStore.domainSettings = { ...obj.domainSettings };
        }
        if (Object.prototype.hasOwnProperty.call(obj, 'enabled')) {
          sharedStore.enabled = obj.enabled;
        }
        return { fallback: false };
      }
    };
    const navigator = {
      locks: {
        request: (name, callback) => {
          lockLog.push(name);
          const result = lockQueue.then(() => callback());
          lockQueue = result.catch(() => {});
          return result;
        }
      }
    };
    const context = vm.createContext({
      SHARED: mockSHARED,
      state,
      chrome,
      navigator,
      elements,
      console: { error: () => {} },
      Promise,
      setTimeout,
      Date,
      window: { confirm: () => true }
    });
    const renderSyncUsageSource = extractFunction(source, 'renderSyncUsage');
    vm.runInContext(renderSyncUsageSource, context);
    return context;
  }

  const source = fs.readFileSync(path.join(root, 'options.js'), 'utf8');
  const lockNameSource = extractConst(source, 'DOMAIN_SETTINGS_LOCK_NAME');
  const lockSource = extractFunction(source, 'withDomainSettingsLock');
  const writeSource = extractStatement(source, 'let writeDomainSettingsTail');
  const updateSource = extractFunction(source, 'updateDomainEntry');

  const ctxA = makeContext();
  vm.runInContext(lockNameSource, ctxA);
  vm.runInContext(lockSource, ctxA);
  vm.runInContext(writeSource, ctxA);
  vm.runInContext(updateSource, ctxA);

  const ctxB = makeContext();
  vm.runInContext(lockNameSource, ctxB);
  vm.runInContext(lockSource, ctxB);
  vm.runInContext(writeSource, ctxB);
  vm.runInContext(updateSource, ctxB);

  const helpers = loadOptionsHelpers();

  const pA = ctxA.updateDomainEntry('options-tab.com', (current) => helpers.computeOptionsPresetEntry(current, SHARED.PRESET_SAFE, SHARED));
  const pB = ctxB.updateDomainEntry('side-panel.com', (current) => helpers.computeOptionsPresetEntry(current, SHARED.PRESET_UPLOAD_SAFE, SHARED));

  await Promise.all([pA, pB]);

  assert.ok(sharedStore.domainSettings['options-tab.com'], 'options-tab domain must be present');
  assert.ok(sharedStore.domainSettings['side-panel.com'], 'side-panel domain must be present');
  assert.strictEqual(sharedStore.domainSettings['options-tab.com'].preset, SHARED.PRESET_SAFE);
  assert.strictEqual(sharedStore.domainSettings['side-panel.com'].preset, SHARED.PRESET_UPLOAD_SAFE);
  assert.ok(lockLog.length >= 2, 'both contexts must acquire the shared lock');
  assert.strictEqual(lockLog[0], 'rcow-domain-settings-write');
  assert.strictEqual(lockLog[1], 'rcow-domain-settings-write');
});

test('two-context lock harness: same-domain concurrent options/side-panel changes have deterministic ordering', async () => {
  const SHARED = loadShared();
  const sharedStore = { domainSettings: {}, enabled: true };
  let writeDelay = 5;
  let lockQueue = Promise.resolve();

  function makeContext() {
    const state = { domainSettings: {}, lastWriteFallback: false, rowStatus: {}, syncAvailable: false, syncBytesInUse: 0 };
    const chrome = { storage: { local: { _area: 'local' }, sync: { _area: 'sync' } } };
    const elements = { syncUsage: { textContent: '' } };
    const mockSHARED = {
      STORAGE_DEFAULTS: SHARED.STORAGE_DEFAULTS,
      parseDomainSetting: SHARED.parseDomainSetting,
      resolveSettings: async () => {
        if (writeDelay > 0) await new Promise(r => setTimeout(r, writeDelay));
        return { enabled: sharedStore.enabled, domainSettings: { ...sharedStore.domainSettings } };
      },
      safeSyncSet: async (obj) => {
        if (obj.domainSettings) {
          sharedStore.domainSettings = { ...obj.domainSettings };
        }
        return { fallback: false };
      }
    };
    const navigator = {
      locks: {
        request: (name, callback) => {
          const result = lockQueue.then(() => callback());
          lockQueue = result.catch(() => {});
          return result;
        }
      }
    };
    const context = vm.createContext({
      SHARED: mockSHARED,
      state,
      chrome,
      navigator,
      elements,
      console: { error: () => {} },
      Promise,
      setTimeout,
      Date,
      window: { confirm: () => true }
    });
    const renderSyncUsageSource = extractFunction(source, 'renderSyncUsage');
    vm.runInContext(renderSyncUsageSource, context);
    return context;
  }

  const source = fs.readFileSync(path.join(root, 'options.js'), 'utf8');
  const lockNameSource = extractConst(source, 'DOMAIN_SETTINGS_LOCK_NAME');
  const lockSource = extractFunction(source, 'withDomainSettingsLock');
  const writeSource = extractStatement(source, 'let writeDomainSettingsTail');
  const updateSource = extractFunction(source, 'updateDomainEntry');

  const ctxA = makeContext();
  vm.runInContext(lockNameSource, ctxA);
  vm.runInContext(lockSource, ctxA);
  vm.runInContext(writeSource, ctxA);
  vm.runInContext(updateSource, ctxA);

  const ctxB = makeContext();
  vm.runInContext(lockNameSource, ctxB);
  vm.runInContext(lockSource, ctxB);
  vm.runInContext(writeSource, ctxB);
  vm.runInContext(updateSource, ctxB);

  const helpers = loadOptionsHelpers();
  const hostname = 'shared.com';

  const pA = ctxA.updateDomainEntry(hostname, (current) => helpers.computeFeatureToggleEntry(current, 'dragDrop', false, SHARED));
  const pB = ctxB.updateDomainEntry(hostname, (current) => helpers.computeOptionsPresetEntry(current, SHARED.PRESET_SAFE, SHARED));

  await Promise.all([pA, pB]);

  const stored = sharedStore.domainSettings[hostname];
  assert.ok(stored, 'domain entry must exist');
  assert.strictEqual(stored.preset, SHARED.PRESET_SAFE, 'last write wins — preset should be safe (deterministic)');
  assert.deepEqual(stored.features, SHARED.PRESET_FEATURES[SHARED.PRESET_SAFE]);
});

test('showRowStatus: stores status in durable state.rowStatus map by hostname', () => {
  const source = fs.readFileSync(path.join(root, 'options.js'), 'utf8');
  const showSource = extractFunction(source, 'showRowStatus');
  const restoreSource = extractFunction(source, 'restoreRowStatus');

  const state = { rowStatus: {} };
  const context = vm.createContext({ state });
  vm.runInContext(showSource, context);
  vm.runInContext(restoreSource, context);

  const el = { textContent: '', classList: { remove: () => {}, add: () => {} } };
  context.showRowStatus('example.com', el, '저장됨', 'success');
  assert.strictEqual(state.rowStatus['example.com'].message, '저장됨');
  assert.strictEqual(state.rowStatus['example.com'].kind, 'success');

  const el2 = { textContent: '', classList: { remove: () => {}, add: () => {} } };
  context.restoreRowStatus('example.com', el2);
  assert.strictEqual(el2.textContent, '저장됨', 'restoreRowStatus must restore the durable message');
});

test('showRowStatus: null hostname does not store status (used for ephemeral display)', () => {
  const source = fs.readFileSync(path.join(root, 'options.js'), 'utf8');
  const showSource = extractFunction(source, 'showRowStatus');
  const state = { rowStatus: {} };
  const context = vm.createContext({ state });
  vm.runInContext(showSource, context);

  const el = { textContent: '', classList: { remove: () => {}, add: () => {} } };
  context.showRowStatus(null, el, '임시 메시지', 'warn');
  assert.strictEqual(Object.keys(state.rowStatus).length, 0, 'null hostname must not store status');
  assert.strictEqual(el.textContent, '임시 메시지');
});

test('handler error propagation: toggle handler reports persisted enabled from operation outcome, not stale entry', async () => {
  const harness = loadOperationQueueHarness();
  const hostname = 'toggle-test.com';

  const outcome = await harness.updateDomainEntry(hostname, (current) => {
    const next = helpers.computeProfilePreservingEntry(current, { enabled: !current.enabled }, SHARED);
    return next;
  });

  assert.ok(outcome, 'updateDomainEntry must return an outcome');
  assert.ok(outcome.nextDomainSettings, 'outcome must include nextDomainSettings');
  const persistedEntry = outcome.nextDomainSettings[hostname];
  assert.ok(persistedEntry, 'persisted entry must exist for the hostname');
  const parsed = SHARED.parseDomainSetting(persistedEntry);
  assert.strictEqual(parsed.enabled, true, 'first toggle from null/default (enabled=true) must persist enabled=true');

  const outcome2 = await harness.updateDomainEntry(hostname, (current) => {
    const next = helpers.computeProfilePreservingEntry(current, { enabled: !current.enabled }, SHARED);
    return next;
  });
  const persistedEntry2 = outcome2.nextDomainSettings[hostname];
  const parsed2 = SHARED.parseDomainSetting(persistedEntry2);
  assert.strictEqual(parsed2.enabled, false, 'second toggle must persist enabled=false (from fresh state, not stale)');
});

test('handler error propagation: toggle failure produces error status via .catch()', async () => {
  const harness = loadOperationQueueHarness();
  const hostname = 'fail-toggle.com';
  harness.setFailOnce();

  await assert.rejects(
    () => harness.updateDomainEntry(hostname, (current) => helpers.computeProfilePreservingEntry(current, { enabled: !current.enabled }, SHARED)),
    /simulated storage failure/
  );

  harness.setShouldFail(false);
  const outcome = await harness.updateDomainEntry(hostname, (current) => helpers.computeOptionsPresetEntry(current, SHARED.PRESET_SAFE, SHARED));
  assert.ok(outcome.nextDomainSettings[hostname], 'write after failure must succeed (queue not poisoned)');
});

test('lock-request rejection: withDomainSettingsLock rejects when navigator.locks.request rejects without invoking callback', async () => {
  const harness = loadOperationQueueHarness({ simulateLocks: true });
  harness.setLockReject(true);
  const hostname = 'lock-reject.com';

  await assert.rejects(
    () => harness.updateDomainEntry(hostname, (current) => helpers.computeOptionsPresetEntry(current, SHARED.PRESET_COMPLETE, SHARED)),
    /lock request denied/
  );

  assert.strictEqual(harness.getLockLog().length, 1, 'lock request must be attempted');
  assert.strictEqual(harness.getLockLog()[0], 'rcow-domain-settings-write');
  assert.ok(!harness.getStored()[hostname], 'no entry must be stored when lock request rejects');
});

test('lock-request rejection: queue recovers after lock rejection — subsequent write succeeds', async () => {
  const harness = loadOperationQueueHarness({ simulateLocks: true });
  const hostname = 'lock-recover.com';

  harness.setLockReject(true);
  await assert.rejects(
    () => harness.updateDomainEntry(hostname, (current) => helpers.computeOptionsPresetEntry(current, SHARED.PRESET_SAFE, SHARED)),
    /lock request denied/
  );

  harness.setLockReject(false);
  await harness.updateDomainEntry(hostname, (current) => helpers.computeOptionsPresetEntry(current, SHARED.PRESET_COMPLETE, SHARED));

  const stored = harness.getStored()[hostname];
  assert.ok(stored, 'write after lock rejection must succeed');
  assert.strictEqual(stored.preset, SHARED.PRESET_COMPLETE);
});

test('visible fallback status: writeDomainSettings calls renderSyncUsage after fallback write', async () => {
  const harness = loadOperationQueueHarness();
  harness.setFallback(true);
  const hostname = 'fallback-visible.com';

  await harness.updateDomainEntry(hostname, (current) => helpers.computeOptionsPresetEntry(current, SHARED.PRESET_COMPLETE, SHARED));

  assert.strictEqual(harness.getState().lastWriteFallback, true, 'lastWriteFallback must be set');
  assert.ok(harness.getRenderSyncUsageCalls() > 0, 'renderSyncUsage must be called after write');
  assert.strictEqual(harness.getSyncUsageText(), '동기화 사용 불가 — 현재 기기에만 저장됨', 'fallback status must be visible even when syncAvailable is false');
});

test('visible fallback status: fallback takes priority over syncAvailable when sync has bytes', async () => {
  const harness = loadOperationQueueHarness();
  harness.getState().syncAvailable = true;
  harness.getState().syncBytesInUse = 5000;
  harness.setFallback(true);
  const hostname = 'fallback-priority.com';

  await harness.updateDomainEntry(hostname, (current) => helpers.computeOptionsPresetEntry(current, SHARED.PRESET_COMPLETE, SHARED));

  assert.strictEqual(harness.getSyncUsageText(), '동기화 사용 불가 — 현재 기기에만 저장됨', 'fallback must override syncAvailable display');
});

test('visible fallback status: writeGlobalEnabled calls renderSyncUsage and surfaces fallback', async () => {
  const harness = loadOperationQueueHarness();
  harness.setFallback(true);

  await harness.writeGlobalEnabled(false);

  assert.strictEqual(harness.getStoredEnabled(), false, 'global enabled must be persisted');
  assert.ok(harness.getRenderSyncUsageCalls() > 0, 'renderSyncUsage must be called after global write');
  assert.strictEqual(harness.getSyncUsageText(), '동기화 사용 불가 — 현재 기기에만 저장됨', 'fallback status must be visible after global write');
});

test('rapid repeated toggles: final persisted enabled matches last toggle, not stale render-time entry', async () => {
  const harness = loadOperationQueueHarness();
  const hostname = 'rapid-toggle.com';
  harness.setWriteDelay(5);

  const p1 = harness.updateDomainEntry(hostname, (current) => helpers.computeProfilePreservingEntry(current, { enabled: !current.enabled }, SHARED));
  const p2 = harness.updateDomainEntry(hostname, (current) => helpers.computeProfilePreservingEntry(current, { enabled: !current.enabled }, SHARED));
  const p3 = harness.updateDomainEntry(hostname, (current) => helpers.computeProfilePreservingEntry(current, { enabled: !current.enabled }, SHARED));

  const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

  const e1 = SHARED.parseDomainSetting(r1.nextDomainSettings[hostname]);
  const e2 = SHARED.parseDomainSetting(r2.nextDomainSettings[hostname]);
  const e3 = SHARED.parseDomainSetting(r3.nextDomainSettings[hostname]);

  assert.strictEqual(e1.enabled, true, 'toggle 1: null→true');
  assert.strictEqual(e2.enabled, false, 'toggle 2: true→false (from fresh state)');
  assert.strictEqual(e3.enabled, true, 'toggle 3: false→true (from fresh state)');

  const finalStored = SHARED.parseDomainSetting(harness.getStored()[hostname]);
  assert.strictEqual(finalStored.enabled, true, 'final stored state must match last toggle result');
});

test('aria-controls: advanced toggle has programmatic relationship with panel via unique id', () => {
  const source = fs.readFileSync(path.join(root, 'options.js'), 'utf8');
  const createSiteRowMatch = source.match(/function createSiteRow[\s\S]*?\n\s*return row;\s*\n\s*\}/);
  const body = createSiteRowMatch[0];

  assert.ok(body.includes('panelId'), 'panelId must be generated');
  assert.ok(body.includes("advancedPanel.id = panelId"), 'panel must receive the id');
  assert.ok(body.includes("advancedToggle.setAttribute('aria-controls', panelId)"), 'toggle must reference panel via aria-controls');
  assert.ok(body.includes("advancedToggle.textContent = expanded ? '고급 설정 펼치기' : '고급 설정 접기'"), 'button text must toggle between 펼치기/접기');
});

test('custom option is disabled in main preset select — cannot be selected as fake canonical reset', () => {
  const html = fs.readFileSync(path.join(root, 'options.html'), 'utf8');
  assert.ok(html.includes('<option value="custom" disabled>'), 'custom option must be disabled in main preset select');
  assert.ok(!html.includes('<option value="custom">사용자 정의</option>'), 'custom must not be selectable');
});

test('preset reset select excludes custom option entirely', () => {
  const html = fs.readFileSync(path.join(root, 'options.html'), 'utf8');
  const resetSelectMatch = html.match(/<select class="site-preset-reset-select"[\s\S]*?<\/select>/);
  assert.ok(resetSelectMatch, 'preset reset select must exist');
  const resetSelectHtml = resetSelectMatch[0];
  assert.ok(!resetSelectHtml.includes('value="custom"'), 'reset select must not include custom option at all');
});
