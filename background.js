// Right-click on Web — background worker/event page

if (!globalThis.RIGHT_CLICK_ON_WEB_SHARED && typeof importScripts === 'function') {
  importScripts('shared.js');
}
if (!globalThis.RIGHT_CLICK_ON_WEB_OCR_SESSION_UTILS && typeof importScripts === 'function') {
  importScripts('ocr-session-utils.js');
}
if (!globalThis.RIGHT_CLICK_ON_WEB_OCR_HISTORY && typeof importScripts === 'function') {
  importScripts('ocr-history.js');
}
if (!globalThis.RIGHT_CLICK_ON_WEB_TOOLBAR_ACTION_UTILS && typeof importScripts === 'function') {
  importScripts('toolbar-action-utils.js');
}
if (!globalThis.RIGHT_CLICK_ON_WEB_IMAGE_CONTEXT && typeof importScripts === 'function') {
  importScripts('image-context.js');
}

const SHARED = globalThis.RIGHT_CLICK_ON_WEB_SHARED;
const OCR_SESSION = globalThis.RIGHT_CLICK_ON_WEB_OCR_SESSION_UTILS;
const OCR_HISTORY = globalThis.RIGHT_CLICK_ON_WEB_OCR_HISTORY;
const TOOLBAR_ACTION = globalThis.RIGHT_CLICK_ON_WEB_TOOLBAR_ACTION_UTILS;
const IMAGE_CONTEXT = globalThis.RIGHT_CLICK_ON_WEB_IMAGE_CONTEXT;
const DEFAULT_SETTINGS = SHARED.STORAGE_DEFAULTS;

const CONTEXT_MENU_IDS = Object.freeze({
  GLOBAL_TOGGLE: 'rcow-global-toggle',
  TRIGGER_OCR: 'rcow-trigger-ocr',
  IMAGE_OCR: 'rcow-image-ocr',
  OPEN_PANEL: 'rcow-open-panel',
  OPEN_OPTIONS: 'rcow-open-options'
});

let creatingOffscreenPromise = null;
let ocrSessionWritePromise = Promise.resolve();
let ocrHistoryWritePromise = Promise.resolve();
let latestOcrRequestId = 0;
const toolbarUpdateVersions = new Map();
const toolbarUpdatePromises = new Map();
const imageContextCache = new Map();

function imageContextCacheKey(tabId, frameId) {
  return `${tabId}:${frameId}`;
}

function rememberImageContext(sender, payload) {
  const tabId = sender?.tab?.id;
  const frameId = Number.isInteger(sender?.frameId) ? sender.frameId : 0;
  const entry = IMAGE_CONTEXT?.createCacheEntry({
    hostname: SHARED.getHostname(sender?.tab?.url),
    timestamp: payload?.timestamp,
    rect: payload?.rect,
    manualCropRequired: payload?.manualCropRequired === true
  });
  if (!Number.isInteger(tabId) || !entry) return false;
  imageContextCache.set(imageContextCacheKey(tabId, frameId), entry);
  return true;
}

async function startManualImageCrop(tab, notice) {
  if (!Number.isInteger(tab?.id)) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'rcow:startCrop', notice });
  } catch (error) {
    console.warn('Failed to start manual image OCR crop:', error);
  }
}

async function handleImageOcrContextClick(info, tab) {
  const frameId = Number.isInteger(info?.frameId) ? info.frameId : 0;
  const hostname = SHARED.getHostname(tab?.url);
  const entry = IMAGE_CONTEXT?.validateCacheEntry(
    imageContextCache.get(imageContextCacheKey(tab?.id, frameId)), hostname
  );
  const fallbackNotice = '이미지 위치를 자동으로 확인할 수 없어 화면에서 영역을 직접 선택하세요.';
  if (!info?.srcUrl || !entry || entry.manualCropRequired) {
    await startManualImageCrop(tab, fallbackNotice);
    return;
  }
  try {
    const current = await chrome.tabs.sendMessage(tab.id, {
      type: 'rcow:validateImageContext', expected: entry
    }, { frameId });
    if (!current?.ok || !IMAGE_CONTEXT.rectsMatch(entry.rect, current.rect)) {
      await startManualImageCrop(tab, fallbackNotice);
      return;
    }
    await captureAndOcr(tab, {
      cropRect: current.rect,
      viewport: current.viewport,
      preprocessingProfile: 'off',
      verifyActiveTab: true,
      source: 'image'
    });
  } catch (error) {
    console.warn('Image OCR coordinate validation failed:', error);
    await startManualImageCrop(tab, fallbackNotice);
  }
}

async function ensureOffscreenDocument() {
  if (typeof chrome.offscreen === 'undefined') {
    throw new Error('이 브라우저는 chrome.offscreen API를 지원하지 않습니다.');
  }
  if (typeof chrome.offscreen.hasDocument === 'function') {
    const hasDoc = await chrome.offscreen.hasDocument();
    if (hasDoc) {
      return;
    }
  } else if (typeof chrome.runtime.getContexts === 'function') {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (contexts.length > 0) {
      return;
    }
  }
  if (creatingOffscreenPromise) {
    await creatingOffscreenPromise;
    return;
  }
  creatingOffscreenPromise = chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['WORKERS'],
    justification: 'Tesseract.js WASM local OCR processing'
  }).catch((error) => {
    if (!error.message?.includes('Only a single offscreen document')) {
      throw error;
    }
  }).finally(() => {
    creatingOffscreenPromise = null;
  });
  await creatingOffscreenPromise;
}

async function triggerCropOnActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, { type: 'rcow:startCrop' });
    }
  } catch (error) {
    console.warn('Failed to send startCrop message to active tab:', error);
  }
}

async function exposeSessionStorageToContentScripts() {
  if (typeof chrome.storage.session?.setAccessLevel !== 'function') {
    return;
  }
  try {
    await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
  } catch (_) {}
}

function hasSessionStorage() {
  const session = chrome.storage && chrome.storage.session;
  return Boolean(session && typeof session.get === 'function' && typeof session.set === 'function');
}

function randomHistoryId() {
  const random = globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `ocr-${random}`.slice(0, OCR_HISTORY.MAX_ID_LENGTH);
}

function enqueueOcrHistoryMutation(operation) {
  const result = ocrHistoryWritePromise.catch(() => {}).then(operation);
  ocrHistoryWritePromise = result.catch(() => {});
  return result;
}

function saveOcrHistoryEntry(payload) {
  return enqueueOcrHistoryMutation(async () => {
    const settings = await SHARED.storageGet(chrome.storage.local, [OCR_HISTORY.OCR_HISTORY_ENABLED_KEY]);
    if (settings[OCR_HISTORY.OCR_HISTORY_ENABLED_KEY] !== true) {
      return { ok: false, disabled: true };
    }
    const entry = OCR_HISTORY.createEntry({
      id: randomHistoryId(),
      text: payload?.text,
      hostname: payload?.hostname,
      savedAt: Date.now()
    });
    if (!entry) throw new Error('저장할 OCR 편집 텍스트 또는 도메인이 올바르지 않습니다.');
    const stored = await SHARED.storageGet(chrome.storage.local, [OCR_HISTORY.OCR_HISTORY_KEY]);
    const entries = OCR_HISTORY.retainHistory([entry, ...(stored[OCR_HISTORY.OCR_HISTORY_KEY] || [])]);
    await SHARED.storageSet(chrome.storage.local, { [OCR_HISTORY.OCR_HISTORY_KEY]: entries });
    return { ok: true, entries };
  });
}

async function readOcrHistorySnapshot() {
  const stored = await SHARED.storageGet(chrome.storage.local, [
    OCR_HISTORY.OCR_HISTORY_ENABLED_KEY, OCR_HISTORY.OCR_HISTORY_KEY
  ]);
  const enabled = stored[OCR_HISTORY.OCR_HISTORY_ENABLED_KEY] === true;
  const entries = OCR_HISTORY.retainHistory(stored[OCR_HISTORY.OCR_HISTORY_KEY]);
  if (enabled && JSON.stringify(entries) !== JSON.stringify(stored[OCR_HISTORY.OCR_HISTORY_KEY] || [])) {
    await SHARED.storageSet(chrome.storage.local, { [OCR_HISTORY.OCR_HISTORY_KEY]: entries });
  }
  return { ok: true, enabled, entries };
}

function getOcrHistory() {
  return enqueueOcrHistoryMutation(readOcrHistorySnapshot);
}

function setOcrHistoryEnabled(enabled, deleteEntries) {
  return enqueueOcrHistoryMutation(async () => {
    await SHARED.storageSet(chrome.storage.local, {
      [OCR_HISTORY.OCR_HISTORY_ENABLED_KEY]: enabled === true
    });
    if (deleteEntries === true) {
      await SHARED.storageRemove(chrome.storage.local, OCR_HISTORY.OCR_HISTORY_KEY);
    }
    return readOcrHistorySnapshot();
  });
}

function deleteAllOcrHistory() {
  return enqueueOcrHistoryMutation(async () => {
    await SHARED.storageRemove(chrome.storage.local, OCR_HISTORY.OCR_HISTORY_KEY);
    return readOcrHistorySnapshot();
  });
}

function deleteOcrHistoryEntry(id) {
  return enqueueOcrHistoryMutation(async () => {
    const settings = await SHARED.storageGet(chrome.storage.local, [OCR_HISTORY.OCR_HISTORY_ENABLED_KEY]);
    if (settings[OCR_HISTORY.OCR_HISTORY_ENABLED_KEY] !== true) {
      return { ok: false, disabled: true };
    }
    const stored = await SHARED.storageGet(chrome.storage.local, [OCR_HISTORY.OCR_HISTORY_KEY]);
    const entries = OCR_HISTORY.retainHistory(stored[OCR_HISTORY.OCR_HISTORY_KEY]).filter((entry) => entry.id !== id);
    if (entries.length === 0) {
      await SHARED.storageRemove(chrome.storage.local, OCR_HISTORY.OCR_HISTORY_KEY);
    } else {
      await SHARED.storageSet(chrome.storage.local, { [OCR_HISTORY.OCR_HISTORY_KEY]: entries });
    }
    return readOcrHistorySnapshot();
  });
}

async function resolveToolbarActionState(url) {
  const hostname = SHARED.getHostname(url);
  const settings = await SHARED.resolveSettings(DEFAULT_SETTINGS);
  const domainSettings = settings.domainSettings && typeof settings.domainSettings === 'object'
    ? settings.domainSettings
    : {};
  let sessionActive = false;
  if (hostname && hasSessionStorage()) {
    const sessionKey = SHARED.sessionKeyFor(hostname);
    try {
      const sessionData = await SHARED.storageGet(chrome.storage.session, sessionKey);
      sessionActive = sessionData[sessionKey] === true;
    } catch (_) {}
  }
  const enabled = sessionActive
    || SHARED.isDomainEnabled(settings.enabled, domainSettings, hostname);
  const mode = sessionActive
    ? SHARED.MODE_ULTIMATE
    : (SHARED.resolveMode(hostname, domainSettings) || SHARED.DEFAULT_MODE);
  return TOOLBAR_ACTION.resolveToolbarActionState({ enabled, mode, sessionActive });
}

async function updateToolbarActionForTab(tabId, url) {
  if (!Number.isInteger(tabId)) {
    return;
  }
  const version = (toolbarUpdateVersions.get(tabId) || 0) + 1;
  toolbarUpdateVersions.set(tabId, version);
  const previousUpdate = toolbarUpdatePromises.get(tabId) || Promise.resolve();
  const update = previousUpdate.catch(() => {}).then(async () => {
    if (toolbarUpdateVersions.get(tabId) !== version) {
      return;
    }
    try {
      let resolvedUrl = url;
      if (typeof resolvedUrl !== 'string' && chrome.tabs && typeof chrome.tabs.get === 'function') {
        const tab = await chrome.tabs.get(tabId);
        resolvedUrl = tab?.url;
      }
      const state = await resolveToolbarActionState(resolvedUrl);
      if (toolbarUpdateVersions.get(tabId) !== version) {
        return;
      }
      await TOOLBAR_ACTION.applyToolbarActionState(chrome.action, tabId, state);
    } catch (_) {}
  });
  toolbarUpdatePromises.set(tabId, update);
  await update;
  if (toolbarUpdatePromises.get(tabId) === update) {
    toolbarUpdatePromises.delete(tabId);
  }
}

async function refreshToolbarActions() {
  if (!chrome.tabs || typeof chrome.tabs.query !== 'function') {
    return;
  }
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs.map((tab) => updateToolbarActionForTab(tab.id, tab.url)));
  } catch (_) {}
}

function updateOcrSession(event) {
  if (!hasSessionStorage()) {
    return Promise.resolve(false);
  }
  const write = async () => {
    try {
      const previous = await SHARED.storageGet(chrome.storage.session, OCR_SESSION.OCR_SESSION_KEYS);
      const next = OCR_SESSION.reduceOcrSessionState(previous, event);
      const update = { [OCR_SESSION.LATEST_OCR_STATUS_KEY]: next[OCR_SESSION.LATEST_OCR_STATUS_KEY] };
      if (event.type === 'success' && next[OCR_SESSION.LATEST_OCR_RESULT_KEY]) {
        update[OCR_SESSION.LATEST_OCR_RESULT_KEY] = next[OCR_SESSION.LATEST_OCR_RESULT_KEY];
        const lastRegionRerun = OCR_SESSION.normalizeLastRegionRerun(event.metadata);
        if (lastRegionRerun && next[OCR_SESSION.LATEST_OCR_STATUS_KEY]?.requestId === event.requestId) {
          update[OCR_SESSION.LAST_REGION_RERUN_KEY] = lastRegionRerun;
        }
      }
      await SHARED.storageSet(chrome.storage.session, update);
      return true;
    } catch (error) {
      console.warn('OCR session state unavailable:', error);
      return false;
    }
  };
  ocrSessionWritePromise = ocrSessionWritePromise.catch(() => false).then(write);
  return ocrSessionWritePromise;
}

async function allocateOcrRequestId() {
  if (hasSessionStorage()) {
    try {
      const stored = await SHARED.storageGet(chrome.storage.session, OCR_SESSION.OCR_SESSION_KEYS);
      latestOcrRequestId = Math.max(latestOcrRequestId, OCR_SESSION.getOcrRequestId(stored));
    } catch (_) {}
  }
  latestOcrRequestId += 1;
  return latestOcrRequestId;
}

async function captureAndOcr(tab, request) {
  const requestId = await allocateOcrRequestId();
  const source = OCR_SESSION.normalizeOcrSource(request?.source);
  try {
    let captureTab = tab;
    if (request?.verifyActiveTab === true) {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!Number.isInteger(activeTab?.id)) {
        throw new Error('현재 탭을 확인할 수 없습니다.');
      }
      const activeHostname = SHARED.getHostname(activeTab?.url);
      const currentViewport = await chrome.tabs.sendMessage(activeTab?.id, { type: 'rcow:getViewport' });
      if (activeTab?.id !== tab?.id || activeHostname !== SHARED.getHostname(tab?.url) ||
          !currentViewport || currentViewport.width !== request.viewport?.width ||
          currentViewport.height !== request.viewport?.height ||
          currentViewport.devicePixelRatio !== request.viewport?.devicePixelRatio) {
        throw new Error('원래 탭과 화면 크기에서 다시 시도하세요.');
      }
      captureTab = activeTab;
    }
    const metadata = {
      tabId: captureTab?.id,
      hostname: SHARED.getHostname(captureTab?.url),
      viewport: request?.viewport,
      cropRect: request?.cropRect,
      capturedAt: Date.now(),
      requestId,
      preprocessingProfile: request?.preprocessingProfile,
      source
    };
    const normalizedMetadata = OCR_SESSION.normalizeCaptureMetadata(metadata);
    if (!normalizedMetadata) {
      throw new Error('OCR 재인식에 필요한 영역 정보가 올바르지 않습니다.');
    }
    void updateOcrSession({ type: 'loading', requestId });
    const dataUrl = await chrome.tabs.captureVisibleTab(captureTab.windowId, { format: 'png' });
    if (!dataUrl) {
      throw new Error('화면 캡처 데이터를 가져올 수 없습니다.');
    }
    await ensureOffscreenDocument();
    const ocrResponse = await chrome.runtime.sendMessage({
      type: 'rcow:runOcr',
      dataUrl,
      cropRect: normalizedMetadata.cropRect,
      devicePixelRatio: normalizedMetadata.devicePixelRatio,
      preprocessingProfile: normalizedMetadata.preprocessingProfile,
      useRequestedPreprocessing: request?.useRequestedPreprocessing === true,
      requestId
    });
    if (!ocrResponse?.ok || ocrResponse.requestId !== requestId) {
      throw new Error(ocrResponse?.error || 'OCR 응답 순서를 확인할 수 없습니다.');
    }
    metadata.preprocessingProfile = OCR_SESSION.OCR_PREPROCESSING_PROFILES.includes(ocrResponse.preprocessing?.profile)
      ? ocrResponse.preprocessing.profile
      : metadata.preprocessingProfile;
    void updateOcrSession({
      type: 'success', result: ocrResponse, source, metadata, requestId
    });
    return ocrResponse;
  } catch (error) {
    void updateOcrSession({ type: 'error', error: error.message || String(error), requestId });
    throw error;
  }
}

async function rerunOcrOnActiveTab() {
  if (!hasSessionStorage()) {
    throw new Error('이 브라우저에서는 OCR 재인식을 지원하지 않습니다.');
  }
  const stored = await SHARED.storageGet(chrome.storage.session, OCR_SESSION.OCR_SESSION_KEYS);
  const metadata = stored?.[OCR_SESSION.LAST_REGION_RERUN_KEY];
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!Number.isInteger(tab?.id)) {
    throw new Error('현재 탭을 확인할 수 없습니다.');
  }
  const viewport = await chrome.tabs.sendMessage(tab.id, { type: 'rcow:getViewport' });
  const validation = OCR_SESSION.validateLastRegionRerun(
    metadata, { id: tab.id, hostname: SHARED.getHostname(tab.url) }, viewport
  );
  if (!validation.ok) {
    throw new Error(validation.error);
  }
  const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (currentTab?.id !== validation.metadata.tabId ||
      SHARED.getHostname(currentTab?.url) !== validation.metadata.hostname) {
    throw new Error('원래 탭에서 다시 시도하세요.');
  }
  const rerunRequest = OCR_SESSION.createLastRegionRerunRequest(validation.metadata);
  if (!rerunRequest) {
    throw new Error('저장된 OCR 영역 정보가 올바르지 않습니다.');
  }
  return captureAndOcr(currentTab, { ...rerunRequest, verifyActiveTab: true });
}

void exposeSessionStorageToContentScripts();

function initializeStorage() {
  chrome.storage.local.get(DEFAULT_SETTINGS, (existing) => {
    chrome.storage.local.set({
      enabled: existing.enabled !== false,
      domainSettings: existing.domainSettings && typeof existing.domainSettings === 'object'
        ? existing.domainSettings
        : {}
    });
  });
}

async function migrateLocalToSync() {
  let syncData;
  try {
    syncData = await SHARED.storageGet(chrome.storage.sync, Object.keys(DEFAULT_SETTINGS));
  } catch (_) {
    return;
  }
  const syncHasState = syncData && (
    syncData.enabled !== undefined ||
    (syncData.domainSettings && Object.keys(syncData.domainSettings).length > 0)
  );
  if (syncHasState) {
    return;
  }
  let localData;
  try {
    localData = await SHARED.storageGet(chrome.storage.local, Object.keys(DEFAULT_SETTINGS));
  } catch (_) {
    return;
  }
  if (!localData || localData.enabled === undefined) {
    return;
  }
  try {
    await SHARED.storageSet(chrome.storage.sync, {
      enabled: localData.enabled !== false,
      domainSettings: localData.domainSettings || {}
    });
  } catch (error) {
    if (!SHARED.isQuotaExceeded(error)) {
      throw error;
    }
  }
}

async function migrateDomainSettings(area) {
  let storedData;
  try {
    storedData = await SHARED.storageGet(area, Object.keys(DEFAULT_SETTINGS));
  } catch (_) {
    return false;
  }
  if (!storedData?.domainSettings) {
    return false;
  }
  const normalized = SHARED.normalizeDomainSettings(storedData.domainSettings);
  if (JSON.stringify(normalized) === JSON.stringify(storedData.domainSettings)) {
    return false;
  }
  try {
    await SHARED.storageSet(area, { domainSettings: normalized });
    return true;
  } catch (error) {
    if (!SHARED.isQuotaExceeded(error)) {
      throw error;
    }
    return false;
  }
}

async function migrateDomainSettingsInAllAreas() {
  await Promise.all([
    migrateDomainSettings(chrome.storage.sync),
    migrateDomainSettings(chrome.storage.local)
  ]);
}

chrome.runtime.onInstalled.addListener((details) => {
  exposeSessionStorageToContentScripts();
  initializeStorage();
  if (details?.reason === 'update') {
    void (async () => {
      await migrateLocalToSync();
      await migrateDomainSettingsInAllAreas();
    })();
  }
  registerContextMenus();
  void refreshToolbarActions();
  if (chrome.sidePanel && typeof chrome.sidePanel.setPanelBehavior === 'function') {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
  }
});

chrome.runtime.onStartup.addListener(() => {
  exposeSessionStorageToContentScripts();
  initializeStorage();
  registerContextMenus();
  void refreshToolbarActions();
});

if (chrome.tabs && typeof chrome.tabs.onActivated?.addListener === 'function') {
  chrome.tabs.onActivated.addListener((activeInfo) => {
    void updateToolbarActionForTab(activeInfo?.tabId);
  });
}

if (chrome.tabs && typeof chrome.tabs.onUpdated?.addListener === 'function') {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (typeof changeInfo?.url === 'string') {
      const updatedUrl = changeInfo.url.length > 0 ? changeInfo.url : tab?.url;
      void updateToolbarActionForTab(tabId, updatedUrl);
    }
  });
}

async function registerContextMenus() {
  if (!chrome.contextMenus || typeof chrome.contextMenus.removeAll !== 'function') {
    return;
  }
  await new Promise((resolve) => chrome.contextMenus.removeAll(resolve));
  const settings = await SHARED.resolveSettings(DEFAULT_SETTINGS);
  const enabled = settings.enabled !== false;
  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.GLOBAL_TOGGLE,
    title: enabled ? '전역 차단 완화 끄기' : '전역 차단 완화 켜기',
    contexts: ['action']
  });
  if (typeof chrome.offscreen !== 'undefined') {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_IDS.TRIGGER_OCR,
      title: '📷 화면 영역 텍스트 추출 (OCR)',
      contexts: ['action']
    });
  }
  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.IMAGE_OCR,
    title: '이미지에서 텍스트 추출 (OCR)',
    contexts: ['image']
  });
  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.OPEN_PANEL,
    title: '사이트 패널에서 열기',
    contexts: ['action']
  });
  chrome.contextMenus.create({
    id: CONTEXT_MENU_IDS.OPEN_OPTIONS,
    title: '전체 사이트 설정 관리',
    contexts: ['action']
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info?.menuItemId) {
    return;
  }
  if (info.menuItemId === CONTEXT_MENU_IDS.GLOBAL_TOGGLE) {
    const settings = await SHARED.resolveSettings(DEFAULT_SETTINGS);
    await SHARED.safeSyncSet({ enabled: settings.enabled === false }, chrome.storage.local);
    registerContextMenus();
    return;
  }
  if (info.menuItemId === CONTEXT_MENU_IDS.TRIGGER_OCR) {
    await triggerCropOnActiveTab();
    return;
  }
  if (info.menuItemId === CONTEXT_MENU_IDS.IMAGE_OCR) {
    await handleImageOcrContextClick(info, tab);
    return;
  }
  if (info.menuItemId === CONTEXT_MENU_IDS.OPEN_PANEL) {
    if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
      const current = await currentWindow();
      if (typeof current?.id === 'number') {
        chrome.sidePanel.open({ windowId: current.id }).catch(() => openOptionsFallback());
      } else {
        openOptionsFallback();
      }
    } else {
      openOptionsFallback();
    }
    return;
  }
  if (info.menuItemId === CONTEXT_MENU_IDS.OPEN_OPTIONS) {
    openOptionsFallback();
  }
});

if (chrome.commands && typeof chrome.commands.onCommand?.addListener === 'function') {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'trigger-ocr') {
      await triggerCropOnActiveTab();
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    return;
  }
  if (message.type === 'rcow:startCropOnActiveTab') {
    void triggerCropOnActiveTab();
    sendResponse({ ok: true });
    return;
  }
  if (message.type === 'rcow:imageContextObserved') {
    sendResponse({ ok: rememberImageContext(sender, message.payload) });
    return;
  }
  if (message.type === 'rcow:captureAndOcr') {
    (async () => {
      try {
        const tab = sender?.tab;
        if (!Number.isInteger(tab?.id) || typeof tab.windowId !== 'number') {
          throw new Error('요청 탭의 Window ID를 확인할 수 없습니다.');
        }
        sendResponse(await captureAndOcr(tab, {
          cropRect: message.cropRect,
          viewport: message.viewport,
          preprocessingProfile: OCR_SESSION.OCR_PREPROCESSING_PROFILES.includes(message.preprocessingProfile)
            ? message.preprocessingProfile
            : 'off',
          source: OCR_SESSION.normalizeOcrSource(message.source)
        }));
      } catch (error) {
        console.error('OCR processing failed in background:', error);
        const response = { ok: false, error: error.message || String(error) };
        sendResponse(response);
      }
    })();
    return true;
  }
  if (message.type === 'rcow:rerunOcrOnActiveTab') {
    (async () => {
      try {
        sendResponse(await rerunOcrOnActiveTab());
      } catch (error) {
        const response = { ok: false, error: error.message || String(error) };
        sendResponse(response);
      }
    })();
    return true;
  }
  if (message.type === 'rcow:getOcrHistory' || message.type === 'rcow:setOcrHistoryEnabled' ||
      message.type === 'rcow:deleteOcrHistoryEntry' || message.type === 'rcow:deleteAllOcrHistory' ||
      message.type === 'rcow:saveOcrHistoryEntry') {
    (async () => {
      try {
        if (message.type === 'rcow:getOcrHistory') sendResponse(await getOcrHistory());
        else if (message.type === 'rcow:setOcrHistoryEnabled') {
          sendResponse(await setOcrHistoryEnabled(message.enabled, message.deleteEntries));
        } else if (message.type === 'rcow:deleteOcrHistoryEntry') sendResponse(await deleteOcrHistoryEntry(message.id));
        else if (message.type === 'rcow:deleteAllOcrHistory') sendResponse(await deleteAllOcrHistory());
        else sendResponse(await saveOcrHistoryEntry({ text: message.text, hostname: message.hostname }));
      } catch (error) {
        sendResponse({ ok: false, error: error.message || String(error) });
      }
    })();
    return true;
  }
});

function openOptionsFallback() {
  if (chrome.runtime && typeof chrome.runtime.openOptionsPage === 'function') {
    chrome.runtime.openOptionsPage();
  }
}

function currentWindow() {
  return new Promise((resolve) => {
    try {
      chrome.windows.getCurrent((current) => resolve(current));
    } catch (_) {
      resolve(null);
    }
  });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' || areaName === 'sync') {
    if (changes.enabled) {
      registerContextMenus();
    }
    if (changes.enabled || changes.domainSettings) {
      void refreshToolbarActions();
    }
  } else if (areaName === 'session') {
    const sessionSettingChanged = Object.keys(changes).some((key) =>
      key.startsWith(SHARED.SESSION_KEY_PREFIX)
    );
    if (sessionSettingChanged) {
      void refreshToolbarActions();
    }
  }
});

void refreshToolbarActions();
