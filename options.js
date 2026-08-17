'use strict';

const SHARED = globalThis.RIGHT_CLICK_ON_WEB_SHARED;
const OCR_SESSION = globalThis.RIGHT_CLICK_ON_WEB_OCR_SESSION_UTILS;
const OCR_HISTORY = globalThis.RIGHT_CLICK_ON_WEB_OCR_HISTORY;
const state = {
  globalEnabled: true,
  domainSettings: {},
  syncBytesInUse: 0,
  syncAvailable: false,
  lastWriteFallback: false,
  rowStatus: {},
  ocr: OCR_SESSION.createOcrUiState(),
  ocrOriginalText: '',
  ocrEditedText: '',
  ocrDisplayedResult: null,
  ocrIsDirty: false,
  ocrPendingNewResult: null,
  ocrPendingNewResultText: null,
  ocrDismissedResultText: null,
  ocrRerunInFlight: false,
  ocrHistoryEnabled: false,
  ocrHistory: [],
  theme: SHARED.DEFAULT_THEME
};

const elements = {
  globalStatus: document.getElementById('globalStatus'),
  globalToggle: document.getElementById('globalToggle'),
  siteCount: document.getElementById('siteCount'),
  siteList: document.getElementById('siteList'),
  syncUsage: document.getElementById('syncUsage'),
  siteRowTemplate: document.getElementById('siteRowTemplate'),
  sidePanelHint: document.querySelector('.side-panel-hint'),
  ocrResultPanel: document.getElementById('ocrResultPanel'),
  ocrResultStatus: document.getElementById('ocrResultStatus'),
  ocrResultMeta: document.getElementById('ocrResultMeta'),
  ocrSourceNotice: document.getElementById('ocrSourceNotice'),
  ocrResultText: document.getElementById('ocrResultText'),
  ocrEditArea: document.getElementById('ocrEditArea'),
  ocrEmptyState: document.getElementById('ocrEmptyState'),
  ocrConfidenceRow: document.getElementById('ocrConfidenceRow'),
  ocrConfidenceValue: document.getElementById('ocrConfidenceValue'),
  ocrConfidenceWarning: document.getElementById('ocrConfidenceWarning'),
  ocrCropSize: document.getElementById('ocrCropSize'),
  ocrOriginalText: document.getElementById('ocrOriginalText'),
  ocrEditedText: document.getElementById('ocrEditedText'),
  ocrEditDirty: document.getElementById('ocrEditDirty'),
  ocrCopyBtn: document.getElementById('ocrCopyBtn'),
  ocrSelectAllBtn: document.getElementById('ocrSelectAllBtn'),
  ocrCleanupBtn: document.getElementById('ocrCleanupBtn'),
  ocrRestoreBtn: document.getElementById('ocrRestoreBtn'),
  ocrCopyToast: document.getElementById('ocrCopyToast'),
  ocrNewResultBanner: document.getElementById('ocrNewResultBanner'),
  ocrAcceptNewBtn: document.getElementById('ocrAcceptNewBtn'),
  ocrDismissBannerBtn: document.getElementById('ocrDismissBannerBtn'),
  ocrRerunBtn: document.getElementById('ocrRerunBtn'),
  ocrRerunNote: document.getElementById('ocrRerunNote'),
  ocrHistorySaveBtn: document.getElementById('ocrHistorySaveBtn'),
  ocrHistorySaveNote: document.getElementById('ocrHistorySaveNote'),
  ocrHistoryToggle: document.getElementById('ocrHistoryToggle'),
  ocrHistoryControls: document.getElementById('ocrHistoryControls'),
  ocrHistorySearch: document.getElementById('ocrHistorySearch'),
  ocrHistoryList: document.getElementById('ocrHistoryList'),
  ocrHistoryDeleteAllBtn: document.getElementById('ocrHistoryDeleteAllBtn'),
  ocrHistoryDisableDeleteBtn: document.getElementById('ocrHistoryDisableDeleteBtn'),
  ocrHistoryStatus: document.getElementById('ocrHistoryStatus'),
  optThemeDark: document.getElementById('optThemeDark'),
  optThemeNeon: document.getElementById('optThemeNeon'),
  optThemeLight: document.getElementById('optThemeLight')
};

for (const [name, el] of Object.entries(elements)) {
  if (!el) {
    throw new Error(`options.js: missing required element #${name}`);
  }
}

async function loadState() {
  const settings = await SHARED.resolveSettings(SHARED.STORAGE_DEFAULTS);
  state.globalEnabled = settings.enabled !== false;
  state.domainSettings = settings.domainSettings && typeof settings.domainSettings === 'object'
    ? settings.domainSettings
    : {};
  state.theme = SHARED.resolveTheme(settings.theme);
  applyTheme(state.theme);
  syncThemeButtons();

  try {
    state.syncBytesInUse = await SHARED.getBytesInUse(chrome.storage.sync);
    state.syncAvailable = state.syncBytesInUse > 0;
  } catch (_) {
    state.syncAvailable = false;
  }
}

function applyTheme(theme) {
  const safe = SHARED.resolveTheme(theme);
  document.documentElement.setAttribute('data-theme', safe);
}

function syncThemeButtons() {
  const map = {
    [SHARED.THEME_DARK]: elements.optThemeDark,
    [SHARED.THEME_NEON]: elements.optThemeNeon,
    [SHARED.THEME_LIGHT]: elements.optThemeLight
  };
  for (const [value, button] of Object.entries(map)) {
    if (!button) continue;
    const isActive = value === state.theme;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-checked', isActive ? 'true' : 'false');
    button.tabIndex = isActive ? 0 : -1;
  }
}

async function handleThemeSelect(theme) {
  const safe = SHARED.resolveTheme(theme);
  state.theme = safe;
  applyTheme(safe);
  syncThemeButtons();
  try {
    await SHARED.safeSyncSet({ theme: safe }, chrome.storage.local);
  } catch (err) {
    console.error('[Right-click on Web] failed to persist theme', err);
  }
}

function sessionStorageArea() {
  const session = chrome.storage && chrome.storage.session;
  return session && typeof session.get === 'function' ? session : null;
}

async function loadOcrState() {
  const session = sessionStorageArea();
  if (!session) {
    state.ocr = OCR_SESSION.applyOcrSessionSnapshot(state.ocr, null);
    return;
  }
  try {
    const snapshot = await SHARED.storageGet(session, OCR_SESSION.OCR_SESSION_KEYS);
    state.ocr = OCR_SESSION.applyOcrSessionSnapshot(state.ocr, snapshot);
  } catch (_) {
    state.ocr = OCR_SESSION.applyOcrSessionSnapshot(state.ocr, null);
  }
}

const LOW_CONFIDENCE_THRESHOLD = 70;

function showOcrCopyToast(message, isError = false) {
  if (!elements.ocrCopyToast) return;
  elements.ocrCopyToast.textContent = message;
  elements.ocrCopyToast.classList.remove('is-success', 'is-error');
  elements.ocrCopyToast.classList.add(isError ? 'is-error' : 'is-success', 'is-visible');
  setTimeout(() => {
    elements.ocrCopyToast.classList.remove('is-visible');
  }, 2500);
}

function cleanupWhitespace(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function handleOcrCopy() {
  const text = elements.ocrEditedText?.value || '';
  if (!text) {
    showOcrCopyToast('복사할 텍스트가 없습니다.', true);
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showOcrCopyToast('클립보드에 복사되었습니다.');
  } catch (_) {
    showOcrCopyToast('복사에 실패했습니다.', true);
  }
}

function handleOcrSelectAll() {
  if (!elements.ocrEditedText) return;
  elements.ocrEditedText.select();
}

function handleOcrCleanup() {
  if (!elements.ocrEditedText) return;
  const current = elements.ocrEditedText.value;
  const cleaned = cleanupWhitespace(current);
  if (cleaned !== current) {
    elements.ocrEditedText.value = cleaned;
    state.ocrEditedText = cleaned;
    state.ocrIsDirty = cleaned !== state.ocrOriginalText;
    elements.ocrEditDirty.classList.toggle('is-hidden', !state.ocrIsDirty);
  }
}

function handleOcrRestore() {
  if (!elements.ocrEditedText) return;
  elements.ocrEditedText.value = state.ocrOriginalText;
  state.ocrEditedText = state.ocrOriginalText;
  state.ocrIsDirty = false;
  elements.ocrEditDirty.classList.add('is-hidden');
}

function handleEditedTextChange() {
  if (!elements.ocrEditedText) return;
  state.ocrEditedText = elements.ocrEditedText.value;
  state.ocrIsDirty = elements.ocrEditedText.value !== state.ocrOriginalText;
  elements.ocrEditDirty.classList.toggle('is-hidden', !state.ocrIsDirty);
}

function handleOcrAcceptNew() {
  if (state.ocrPendingNewResult) {
    const newResult = state.ocrPendingNewResult;
    state.ocrOriginalText = newResult.text;
    state.ocrEditedText = newResult.text;
    state.ocrDisplayedResult = newResult;
    state.ocrIsDirty = false;
    state.ocrPendingNewResult = null;
    state.ocrPendingNewResultText = null;
    state.ocrDismissedResultText = null;
    if (elements.ocrEditedText) elements.ocrEditedText.value = state.ocrEditedText;
    if (elements.ocrOriginalText) elements.ocrOriginalText.textContent = state.ocrOriginalText;
    if (elements.ocrEditDirty) elements.ocrEditDirty.classList.add('is-hidden');
    elements.ocrNewResultBanner?.classList.add('is-hidden');
  }
}

function handleOcrDismissBanner() {
  if (state.ocrPendingNewResultText) {
    state.ocrDismissedResultText = state.ocrPendingNewResultText;
  }
  state.ocrPendingNewResult = null;
  state.ocrPendingNewResultText = null;
  elements.ocrNewResultBanner?.classList.add('is-hidden');
}

function renderOcrRerun() {
  const metadata = state.ocr.lastRegionRerun;
  const isAvailable = state.ocr.supported && Boolean(metadata) && !state.ocrRerunInFlight;
  elements.ocrRerunBtn.disabled = !isAvailable;
  elements.ocrRerunBtn.title = isAvailable
    ? '같은 화면 영역을 새로 캡처하여 다시 인식합니다.'
    : '마지막 수동 영역 OCR이 있어야 다시 인식할 수 있습니다.';
  elements.ocrRerunNote.textContent = state.ocrRerunInFlight
    ? '현재 탭을 새로 캡처하여 OCR을 실행하고 있습니다.'
    : (metadata
      ? '마지막 수동 영역을 같은 탭과 화면 크기에서 새로 캡처합니다. 이미지 OCR은 이 영역을 바꾸지 않으며 이미지 파일은 저장하지 않습니다.'
      : '마지막 수동 영역 OCR이 없습니다. 확장 아이콘에서 영역을 선택하면 준비됩니다.');
}

async function handleOcrRerun() {
  if (state.ocrRerunInFlight || !state.ocr.lastRegionRerun) {
    return;
  }
  state.ocrRerunInFlight = true;
  renderOcrRerun();
  try {
    const response = await chrome.runtime.sendMessage({ type: 'rcow:rerunOcrOnActiveTab' });
    if (!response?.ok) {
      throw new Error(response?.error || 'OCR 재인식에 실패했습니다.');
    }
  } catch (error) {
    showOcrCopyToast(error.message || 'OCR 재인식에 실패했습니다.', true);
  } finally {
    state.ocrRerunInFlight = false;
    renderOcrRerun();
  }
}

function attachOcrEditListeners() {
  elements.ocrCopyBtn?.addEventListener('click', handleOcrCopy);
  elements.ocrSelectAllBtn?.addEventListener('click', handleOcrSelectAll);
  elements.ocrCleanupBtn?.addEventListener('click', handleOcrCleanup);
  elements.ocrRestoreBtn?.addEventListener('click', handleOcrRestore);
  elements.ocrEditedText?.addEventListener('input', handleEditedTextChange);
  elements.ocrAcceptNewBtn?.addEventListener('click', handleOcrAcceptNew);
  elements.ocrDismissBannerBtn?.addEventListener('click', handleOcrDismissBanner);
  elements.ocrRerunBtn?.addEventListener('click', () => handleOcrRerun());
  elements.ocrHistorySaveBtn?.addEventListener('click', () => handleOcrHistorySave());
  elements.ocrHistoryToggle?.addEventListener('click', () => handleOcrHistoryToggle());
  elements.ocrHistoryDeleteAllBtn?.addEventListener('click', () => handleOcrHistoryDeleteAll());
  elements.ocrHistoryDisableDeleteBtn?.addEventListener('click', () => handleOcrHistoryDisableDelete());
  elements.ocrHistorySearch?.addEventListener('input', renderOcrHistory);
}

async function sendOcrHistoryMessage(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || 'OCR 기록 처리에 실패했습니다.');
  state.ocrHistoryEnabled = response.enabled === true;
  state.ocrHistory = OCR_HISTORY.retainHistory(response.entries);
  renderOcrHistory();
  return response;
}

async function loadOcrHistory() {
  await sendOcrHistoryMessage({ type: 'rcow:getOcrHistory' });
}

function renderOcrHistory() {
  const enabled = state.ocrHistoryEnabled;
  elements.ocrHistoryToggle.textContent = enabled ? 'ON' : 'OFF';
  elements.ocrHistoryToggle.classList.toggle('is-off', !enabled);
  elements.ocrHistoryToggle.setAttribute('aria-pressed', String(enabled));
  elements.ocrHistoryControls.classList.toggle('is-hidden', !enabled);
  elements.ocrHistorySaveBtn.disabled = !enabled || !state.ocrDisplayedResult || !state.ocrEditedText.trim();
  elements.ocrHistorySaveNote.textContent = enabled
    ? '현재 편집본만 이 기기에 최대 20개, 30일까지 저장합니다. 원본 OCR 결과는 자동 저장하지 않습니다.'
    : '기록은 기본적으로 꺼져 있습니다. 켜야 현재 편집본을 저장할 수 있습니다.';
  const query = elements.ocrHistorySearch.value;
  const entries = OCR_HISTORY.searchHistory(state.ocrHistory, query);
  elements.ocrHistoryList.replaceChildren();
  if (!enabled) return;
  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = query ? '검색 결과가 없습니다.' : '저장된 OCR 기록이 없습니다.';
    elements.ocrHistoryList.append(empty);
    return;
  }
  for (const entry of entries) {
    const article = document.createElement('article');
    article.className = 'ocr-history-entry';
    const meta = document.createElement('p');
    meta.className = 'ocr-history-entry-meta';
    meta.textContent = `${entry.hostname} · ${new Date(entry.savedAt).toLocaleString('ko-KR')}`;
    const text = document.createElement('p');
    text.className = 'ocr-history-entry-text';
    text.textContent = entry.text;
    const remove = document.createElement('button');
    remove.className = 'delete-button';
    remove.type = 'button';
    remove.textContent = '삭제';
    remove.addEventListener('click', () => sendOcrHistoryMessage({ type: 'rcow:deleteOcrHistoryEntry', id: entry.id })
      .then(() => { elements.ocrHistoryStatus.textContent = 'OCR 기록을 삭제했습니다.'; })
      .catch((error) => { elements.ocrHistoryStatus.textContent = `OCR 기록 삭제 실패: ${error.message}`; }));
    article.append(meta, text, remove);
    elements.ocrHistoryList.append(article);
  }
}

async function handleOcrHistorySave() {
  try {
    const result = state.ocrDisplayedResult;
    await sendOcrHistoryMessage({ type: 'rcow:saveOcrHistoryEntry', text: state.ocrEditedText, hostname: result?.metadata?.hostname });
    elements.ocrHistoryStatus.textContent = '현재 편집본을 이 기기에 저장했습니다.';
  } catch (error) {
    elements.ocrHistoryStatus.textContent = `OCR 기록 저장 실패: ${error.message}`;
  }
}

async function handleOcrHistoryToggle() {
  try {
    await sendOcrHistoryMessage({ type: 'rcow:setOcrHistoryEnabled', enabled: !state.ocrHistoryEnabled, deleteEntries: false });
    elements.ocrHistoryStatus.textContent = state.ocrHistoryEnabled ? 'OCR 기록을 켰습니다.' : 'OCR 기록을 껐습니다. 기존 기록은 유지됩니다.';
  } catch (error) { elements.ocrHistoryStatus.textContent = `OCR 기록 설정 실패: ${error.message}`; }
}

async function handleOcrHistoryDeleteAll() {
  try {
    await sendOcrHistoryMessage({ type: 'rcow:deleteAllOcrHistory' });
    elements.ocrHistoryStatus.textContent = 'OCR 기록을 모두 삭제했습니다.';
  } catch (error) { elements.ocrHistoryStatus.textContent = `OCR 기록 삭제 실패: ${error.message}`; }
}

async function handleOcrHistoryDisableDelete() {
  try {
    await sendOcrHistoryMessage({ type: 'rcow:setOcrHistoryEnabled', enabled: false, deleteEntries: true });
    elements.ocrHistoryStatus.textContent = 'OCR 기록을 끄고 모든 기록을 삭제했습니다.';
  } catch (error) { elements.ocrHistoryStatus.textContent = `OCR 기록 삭제 실패: ${error.message}`; }
}

function renderSyncUsage() {
  if (state.lastWriteFallback) {
    elements.syncUsage.textContent = '동기화 사용 불가 — 현재 기기에만 저장됨';
  } else if (state.syncAvailable) {
    const total = (SHARED.SYNC_QUOTA && SHARED.SYNC_QUOTA.BYTES_TOTAL) || 1;
    const kb = Math.round(state.syncBytesInUse / 1024);
    const limitKb = Math.round(total / 1024);
    const pct = Math.round((state.syncBytesInUse / total) * 100);
    elements.syncUsage.textContent = `동기화 사용량: ${kb}KB / ${limitKb}KB (${Number.isFinite(pct) ? pct : 0}%)`;
  } else {
    elements.syncUsage.textContent = '동기화 저장소에 아직 설정이 없습니다. 첫 설정 변경 시 Chrome Sync를 사용합니다.';
  }
}

function renderGlobalState() {
  elements.globalStatus.textContent = state.globalEnabled
    ? '전역 차단 완화 활성화'
    : '전역 차단 완화 비활성화';
  elements.globalToggle.textContent = state.globalEnabled ? 'ON' : 'OFF';
  elements.globalToggle.classList.toggle('is-off', !state.globalEnabled);
  elements.globalToggle.setAttribute('aria-pressed', String(state.globalEnabled));
}

function renderOcrSourceNotice(source) {
  const isImage = OCR_SESSION.normalizeOcrSource(source) === 'image';
  elements.ocrSourceNotice.textContent = isImage
    ? '현재 화면에 보이는 이미지 부분만 인식합니다. 화면 밖이나 가려진 부분은 인식되지 않습니다.'
    : '';
  elements.ocrSourceNotice.classList.toggle('is-hidden', !isImage);
}

function renderOcrResult() {
  const result = state.ocr.latestOcrResult;
  const status = state.ocr.latestOcrStatus;
  elements.ocrResultPanel.classList.toggle('is-disabled', !state.ocr.supported);
  renderOcrRerun();

  if (!state.ocr.supported) {
    elements.ocrResultStatus.textContent = '사용 불가';
    elements.ocrResultMeta.textContent = '이 브라우저는 세션 OCR 결과 저장소를 지원하지 않습니다.';
    elements.ocrSourceNotice.classList.add('is-hidden');
    elements.ocrEditArea?.classList.add('is-hidden');
    elements.ocrEmptyState?.classList.remove('is-hidden');
    if (elements.ocrResultText) elements.ocrResultText.textContent = '최근 OCR 결과를 이 화면에 표시할 수 없습니다.';
    state.ocrOriginalText = '';
    state.ocrEditedText = '';
    state.ocrDisplayedResult = null;
    state.ocrIsDirty = false;
    return;
  }

  if (status?.state === 'loading') {
    elements.ocrResultStatus.textContent = '처리 중';
  } else if (status?.state === 'error') {
    elements.ocrResultStatus.textContent = '최근 시도 실패';
  } else if (result) {
    elements.ocrResultStatus.textContent = '성공';
  } else {
    elements.ocrResultStatus.textContent = '결과 없음';
  }

  if (!result) {
    elements.ocrResultMeta.textContent = status?.state === 'error'
      ? `OCR 오류: ${status.error}`
      : '성공한 OCR 결과가 아직 없습니다.';
    elements.ocrSourceNotice.classList.add('is-hidden');
    elements.ocrEditArea?.classList.add('is-hidden');
    elements.ocrEmptyState?.classList.remove('is-hidden');
    if (elements.ocrResultText) elements.ocrResultText.textContent = '아직 성공한 OCR 결과가 없습니다.';
    state.ocrOriginalText = '';
    state.ocrEditedText = '';
    state.ocrDisplayedResult = null;
    state.ocrIsDirty = false;
    renderOcrRerun();
    return;
  }

  const confidence = Math.round(result.confidence?.average || 0);
  const cropWidth = Math.round(result.crop?.width || 0);
  const cropHeight = Math.round(result.crop?.height || 0);
  const profile = result.preprocessing?.profile || 'off';
  const source = OCR_SESSION.normalizeOcrSource(result.source);
  const sourceLabel = source === 'image' ? '이미지' : '영역';
  const summary = `신뢰도 ${confidence}% · ${cropWidth}×${cropHeight}px · 전처리 ${profile} · 출처 ${sourceLabel}`;
  elements.ocrResultMeta.textContent = status?.state === 'error'
    ? `${summary} · 최근 오류: ${status.error}`
    : summary;
  renderOcrSourceNotice(source);

  const rawText = result.text || '(인식된 텍스트 없음)';

  const decision = OCR_SESSION.computeOcrEditPendingState({
    ocrOriginalText: state.ocrOriginalText,
    ocrIsDirty: state.ocrIsDirty,
    ocrPendingNewResultText: state.ocrPendingNewResultText,
    ocrDismissedResultText: state.ocrDismissedResultText
  }, rawText);

  if (!decision.newIsDirty) {
    state.ocrOriginalText = decision.newOriginalText;
    state.ocrEditedText = decision.newEditedText;
    state.ocrDisplayedResult = result;
    state.ocrIsDirty = false;
    state.ocrPendingNewResult = null;
    state.ocrPendingNewResultText = null;
    state.ocrDismissedResultText = null;
    elements.ocrNewResultBanner?.classList.add('is-hidden');
  } else if (decision.showBanner) {
    state.ocrPendingNewResult = result;
    state.ocrPendingNewResultText = decision.newPendingText;
    elements.ocrNewResultBanner?.classList.remove('is-hidden');
  } else {
    elements.ocrNewResultBanner?.classList.add('is-hidden');
  }

  if (elements.ocrOriginalText) elements.ocrOriginalText.textContent = state.ocrOriginalText;
  if (elements.ocrEditedText) elements.ocrEditedText.value = state.ocrEditedText;
  if (elements.ocrEditDirty) elements.ocrEditDirty.classList.toggle('is-hidden', !state.ocrIsDirty);

  if (elements.ocrConfidenceValue) {
    elements.ocrConfidenceValue.textContent = `신뢰도 ${confidence}%`;
  }
  if (elements.ocrConfidenceRow) {
    elements.ocrConfidenceRow.classList.toggle('is-low-confidence', confidence < LOW_CONFIDENCE_THRESHOLD);
  }
  if (elements.ocrConfidenceWarning) {
    elements.ocrConfidenceWarning.classList.toggle('is-hidden', confidence >= LOW_CONFIDENCE_THRESHOLD);
  }
  if (elements.ocrCropSize) {
    elements.ocrCropSize.textContent = `${cropWidth}×${cropHeight}px`;
  }

  elements.ocrEditArea?.classList.remove('is-hidden');
  elements.ocrEmptyState?.classList.add('is-hidden');
  renderOcrRerun();
  renderOcrHistory();
}

function isAllowedFeatureKey(key, SHARED) {
  return SHARED.FEATURE_KEYS.includes(key);
}

function computeOptionsPresetEntry(currentDomainEntry, presetId, SHARED) {
  const parsed = SHARED.parseDomainSetting(currentDomainEntry);
  const enabled = currentDomainEntry === null || currentDomainEntry === undefined ? true : parsed.enabled;
  const mode = currentDomainEntry === null || currentDomainEntry === undefined ? SHARED.DEFAULT_MODE : parsed.mode;
  const raw = { enabled, mode, preset: presetId };
  const normalized = SHARED.parseDomainSetting(raw);
  return { enabled: normalized.enabled, mode: normalized.mode, preset: normalized.preset, features: normalized.features };
}

function computeFeatureToggleEntry(currentDomainEntry, featureKey, featureValue, SHARED) {
  const parsed = SHARED.parseDomainSetting(currentDomainEntry);
  const enabled = currentDomainEntry === null || currentDomainEntry === undefined ? true : parsed.enabled;
  const mode = currentDomainEntry === null || currentDomainEntry === undefined ? SHARED.DEFAULT_MODE : parsed.mode;
  const features = { ...parsed.features };
  if (isAllowedFeatureKey(featureKey, SHARED)) {
    features[featureKey] = Boolean(featureValue);
  }
  const raw = { enabled, mode, preset: SHARED.PRESET_CUSTOM, features };
  const normalized = SHARED.parseDomainSetting(raw);
  return { enabled: normalized.enabled, mode: normalized.mode, preset: normalized.preset, features: normalized.features };
}

function computePresetResetEntry(currentDomainEntry, presetId, SHARED) {
  const parsed = SHARED.parseDomainSetting(currentDomainEntry);
  const enabled = currentDomainEntry === null || currentDomainEntry === undefined ? true : parsed.enabled;
  const mode = currentDomainEntry === null || currentDomainEntry === undefined ? SHARED.DEFAULT_MODE : parsed.mode;
  const raw = { enabled, mode, preset: presetId };
  const normalized = SHARED.parseDomainSetting(raw);
  return { enabled: normalized.enabled, mode: normalized.mode, preset: normalized.preset, features: normalized.features };
}

function computeProfilePreservingEntry(currentDomainEntry, overrides, SHARED) {
  const parsed = SHARED.parseDomainSetting(currentDomainEntry);
  const enabled = Object.prototype.hasOwnProperty.call(overrides, 'enabled')
    ? overrides.enabled
    : (currentDomainEntry === null || currentDomainEntry === undefined ? true : parsed.enabled);
  const mode = Object.prototype.hasOwnProperty.call(overrides, 'mode')
    ? overrides.mode
    : (currentDomainEntry === null || currentDomainEntry === undefined ? SHARED.DEFAULT_MODE : parsed.mode);
  const raw = { enabled, mode, preset: parsed.preset, features: parsed.features };
  const normalized = SHARED.parseDomainSetting(raw);
  return { enabled: normalized.enabled, mode: normalized.mode, preset: normalized.preset, features: normalized.features };
}

function featureLabelKorean(key) {
  const labels = {
    contextMenu: '우클릭 메뉴',
    selection: '텍스트 선택',
    copyShortcuts: '복사 단축키',
    dragStart: '드래그 시작',
    dragDrop: '드래그 드롭',
    overlayCleanup: '오버레이 정리',
    printUnhide: '인쇄 숨김 해제',
    shadowDom: '섀도 DOM',
    ultimateCss: 'Ultimate CSS'
  };
  return labels[key] || key;
}

function optionsPresetLabelKorean(presetId) {
  const labels = {
    safe: '안전',
    selection: '선택 (고급)',
    complete: '완전',
    'upload-safe': '업로드 보호',
    'media-safe': '미디어 보호 (고급)',
    custom: '사용자 정의'
  };
  return labels[presetId] || presetId;
}

function showRowStatus(hostname, el, message, kind) {
  if (hostname) {
    state.rowStatus[hostname] = { message, kind };
  }
  if (!el) return;
  el.textContent = message;
  el.classList.remove('is-error', 'is-success', 'is-warn');
  if (kind === 'error') el.classList.add('is-error');
  else if (kind === 'success') el.classList.add('is-success');
  else if (kind === 'warn') el.classList.add('is-warn');
}

function restoreRowStatus(hostname, el) {
  const stored = state.rowStatus[hostname];
  if (stored) {
    showRowStatus(null, el, stored.message, stored.kind);
  }
}

function createSiteRow(hostname, rawSetting) {
  const entry = SHARED.parseDomainSetting(rawSetting);
  const fragment = elements.siteRowTemplate.content.cloneNode(true);
  const row = fragment.querySelector('.site-row');
  const hostnameElement = fragment.querySelector('.site-hostname');
  const stateElement = fragment.querySelector('.site-state');
  const toggle = fragment.querySelector('.site-toggle');
  const lite = fragment.querySelector('.site-mode-lite');
  const ultimate = fragment.querySelector('.site-mode-ultimate');
  const remove = fragment.querySelector('.delete-button');
  const presetSelect = fragment.querySelector('.site-preset-select');
  const advancedToggle = fragment.querySelector('.advanced-toggle-button');
  const advancedPanel = fragment.querySelector('.site-row-advanced-panel');
  const featureCheckboxes = Array.from(fragment.querySelectorAll('.feature-checkbox'));
  const presetResetSelect = fragment.querySelector('.site-preset-reset-select');
  const presetResetButton = fragment.querySelector('.preset-reset-button');
  const statusElement = fragment.querySelector('.site-row-status');

  const panelId = `site-advanced-${hostname.replace(/[^a-zA-Z0-9-]/g, '-')}`;
  advancedPanel.id = panelId;
  advancedToggle.setAttribute('aria-controls', panelId);

  hostnameElement.textContent = hostname;
  stateElement.textContent = entry.enabled ? '이 사이트에서 항상 ON' : '이 사이트에서 항상 OFF';
  toggle.textContent = entry.enabled ? 'ON' : 'OFF';
  toggle.classList.toggle('is-off', !entry.enabled);
  toggle.setAttribute('aria-pressed', String(entry.enabled));
  lite.classList.toggle('is-active', entry.mode === SHARED.MODE_LITE);
  ultimate.classList.toggle('is-active', entry.mode === SHARED.MODE_ULTIMATE);
  lite.setAttribute('aria-checked', String(entry.mode === SHARED.MODE_LITE));
  ultimate.setAttribute('aria-checked', String(entry.mode === SHARED.MODE_ULTIMATE));
  lite.setAttribute('tabindex', String(entry.mode === SHARED.MODE_LITE ? 0 : -1));
  ultimate.setAttribute('tabindex', String(entry.mode === SHARED.MODE_ULTIMATE ? 0 : -1));

  presetSelect.value = entry.preset;
  for (const cb of featureCheckboxes) {
    const key = cb.getAttribute('data-feature');
    cb.checked = Boolean(entry.features[key]);
  }
  presetResetSelect.value = SHARED.PRESET_COMPLETE;

  restoreRowStatus(hostname, statusElement);

  toggle.addEventListener('click', () => {
    updateDomainEntry(hostname, (current) => computeProfilePreservingEntry(current, { enabled: !current.enabled }, SHARED))
      .then((outcome) => {
        const persistedEntry = outcome.nextDomainSettings && outcome.nextDomainSettings[hostname];
        const persistedEnabled = persistedEntry ? SHARED.parseDomainSetting(persistedEntry).enabled : null;
        const label = persistedEnabled === null ? '토글 저장됨' : (persistedEnabled ? '이 사이트 ON으로 저장됨' : '이 사이트 OFF로 저장됨');
        showRowStatus(hostname, statusElement, label, 'success');
      })
      .catch(() => showRowStatus(hostname, statusElement, '토글 저장 실패', 'error'));
  });
  lite.addEventListener('click', () => {
    updateDomainEntry(hostname, (current) => computeProfilePreservingEntry(current, { mode: SHARED.MODE_LITE }, SHARED))
      .then(() => showRowStatus(hostname, statusElement, 'Lite 모드 저장됨', 'success'))
      .catch(() => showRowStatus(hostname, statusElement, '모드 저장 실패', 'error'));
  });
  ultimate.addEventListener('click', () => {
    updateDomainEntry(hostname, (current) => computeProfilePreservingEntry(current, { mode: SHARED.MODE_ULTIMATE }, SHARED))
      .then(() => showRowStatus(hostname, statusElement, 'Ultimate 모드 저장됨', 'success'))
      .catch(() => showRowStatus(hostname, statusElement, '모드 저장 실패', 'error'));
  });
  remove.addEventListener('click', () => {
    removeDomain(hostname)
      .then(() => { state.rowStatus[hostname] = null; })
      .catch(() => showRowStatus(hostname, statusElement, '삭제 실패', 'error'));
  });
  remove.setAttribute('aria-label', `'${hostname}' 설정 삭제`);

  presetSelect.addEventListener('change', () => {
    const presetId = presetSelect.value;
    if (!SHARED.VALID_PRESETS.includes(presetId)) {
      showRowStatus(hostname, statusElement, '지원하지 않는 프리셋입니다.', 'error');
      return;
    }
    updateDomainEntry(hostname, (current) => computeOptionsPresetEntry(current, presetId, SHARED))
      .then(() => showRowStatus(hostname, statusElement, `${optionsPresetLabelKorean(presetId)} 프리셋 적용됨`, 'success'))
      .catch(() => showRowStatus(hostname, statusElement, '프리셋 저장 실패', 'error'));
  });

  advancedToggle.addEventListener('click', () => {
    const expanded = advancedToggle.getAttribute('aria-expanded') === 'true';
    advancedToggle.setAttribute('aria-expanded', String(!expanded));
    advancedToggle.textContent = expanded ? '고급 설정 펼치기' : '고급 설정 접기';
    advancedPanel.classList.toggle('is-hidden', expanded);
  });

  for (const cb of featureCheckboxes) {
    cb.addEventListener('change', () => {
      const key = cb.getAttribute('data-feature');
      if (!isAllowedFeatureKey(key, SHARED)) {
        showRowStatus(hostname, statusElement, `허용되지 않은 기능 키: ${key}`, 'error');
        return;
      }
      const value = cb.checked;
      updateDomainEntry(hostname, (current) => computeFeatureToggleEntry(current, key, value, SHARED))
        .then(() => showRowStatus(hostname, statusElement, `${featureLabelKorean(key)} ${value ? '켜짐' : '꺼짐'} — 사용자 정의로 전환`, 'success'))
        .catch(() => showRowStatus(hostname, statusElement, '기능 변경 저장 실패', 'error'));
    });
  }

  presetResetButton.addEventListener('click', () => {
    const presetId = presetResetSelect.value;
    if (!SHARED.VALID_PRESETS.includes(presetId) || presetId === SHARED.PRESET_CUSTOM) {
      showRowStatus(hostname, statusElement, '되돌릴 프리셋을 선택하세요 (사용자 정의 제외).', 'error');
      return;
    }
    updateDomainEntry(hostname, (current) => computePresetResetEntry(current, presetId, SHARED))
      .then(() => showRowStatus(hostname, statusElement, `${optionsPresetLabelKorean(presetId)} 프리셋으로 되돌림`, 'success'))
      .catch(() => showRowStatus(hostname, statusElement, '프리셋 되돌리기 실패', 'error'));
  });

  function handleSiteModeKeydown(event) {
    const KB = globalThis.RIGHT_CLICK_ON_WEB_KEYBOARD_UTILS;
    if (!KB) return;
    const isLiteActive = lite.classList.contains('is-active');
    const active = isLiteActive ? lite : ultimate;
    const nextMode = KB.getNextModeFromKeydown(isLiteActive ? KB.MODE_LITE : KB.MODE_ULTIMATE, event.key);
    if (!nextMode) return;
    event.preventDefault();
    const next = nextMode === KB.MODE_LITE ? lite : ultimate;
    if (active) {
      active.setAttribute('tabindex', '-1');
    }
    next.setAttribute('tabindex', '0');
    next.focus();
    updateDomainEntry(hostname, (current) => computeProfilePreservingEntry(current, { mode: nextMode }, SHARED))
      .catch(() => showRowStatus(hostname, statusElement, '모드 저장 실패', 'error'));
  }

  lite.addEventListener('keydown', handleSiteModeKeydown);
  ultimate.addEventListener('keydown', handleSiteModeKeydown);
  return row;
}

function renderSites() {
  const entries = Object.entries(state.domainSettings)
    .sort(([left], [right]) => left.localeCompare(right));
  elements.siteCount.textContent = `${entries.length}개`;
  elements.siteList.replaceChildren();
  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = '저장된 사이트별 설정이 없습니다. 웹페이지의 확장 팝업에서 사이트 설정을 만들 수 있습니다.';
    elements.siteList.append(empty);
    return;
  }
  for (const [hostname, setting] of entries) {
    elements.siteList.append(createSiteRow(hostname, setting));
  }
}

function render() {
  renderGlobalState();
  renderSites();
  renderSyncUsage();
  renderSidePanelHint();
  renderOcrResult();
}

function renderSidePanelHint() {
  if (!elements.sidePanelHint) {
    return;
  }
  const supported = typeof chrome !== 'undefined' && chrome.sidePanel && typeof chrome.sidePanel.open === 'function';
  elements.sidePanelHint.classList.toggle('is-hidden', !supported);
}

const DOMAIN_SETTINGS_LOCK_NAME = 'rcow-domain-settings-write';

function withDomainSettingsLock(operation) {
  if (typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function') {
    return navigator.locks.request(DOMAIN_SETTINGS_LOCK_NAME, async () => operation());
  }
  return operation();
}

let writeDomainSettingsTail = Promise.resolve();
function writeDomainSettings(operation) {
  const result = new Promise((resolve, reject) => {
    writeDomainSettingsTail = writeDomainSettingsTail
      .catch(() => {})
      .then(async () => {
        try {
          const outcome = await withDomainSettingsLock(async () => {
            const fresh = await SHARED.resolveSettings(SHARED.STORAGE_DEFAULTS);
            const freshDomainSettings = (fresh && fresh.domainSettings && typeof fresh.domainSettings === 'object')
              ? fresh.domainSettings
              : {};
            const operationResult = await operation(freshDomainSettings);
            let fallback = false;
            if (operationResult !== undefined && operationResult !== null) {
              const result = await SHARED.safeSyncSet({ domainSettings: operationResult }, chrome.storage.local);
              fallback = Boolean(result && result.fallback);
              state.lastWriteFallback = fallback;
            }
            return { fallback, nextDomainSettings: operationResult };
          });
          renderSyncUsage();
          resolve(outcome);
        } catch (err) {
          console.error('[Right-click on Web] failed to persist domain settings', err);
          reject(err);
        }
      });
  });
  writeDomainSettingsTail = result.catch(() => {});
  return result;
}

async function updateDomainEntry(hostname, computeEntry) {
  return writeDomainSettings((freshDomainSettings) => {
    const freshEntry = freshDomainSettings[hostname];
    const nextEntry = computeEntry(SHARED.parseDomainSetting(freshEntry));
    return { ...freshDomainSettings, [hostname]: nextEntry };
  });
}

let writeGlobalTail = Promise.resolve();
function writeGlobalEnabled(nextEnabled) {
  const result = new Promise((resolve, reject) => {
    writeGlobalTail = writeGlobalTail
      .catch(() => {})
      .then(async () => {
        try {
          const result = await SHARED.safeSyncSet({ enabled: nextEnabled }, chrome.storage.local);
          const fallback = Boolean(result && result.fallback);
          state.lastWriteFallback = fallback;
          renderSyncUsage();
          resolve({ fallback });
        } catch (err) {
          console.error('[Right-click on Web] failed to persist global toggle', err);
          reject(err);
        }
      });
  });
  writeGlobalTail = result.catch(() => {});
  return result;
}

async function handleGlobalToggle() {
  await writeGlobalEnabled(state.globalEnabled === false);
}

async function removeDomain(hostname) {
  if (typeof window.confirm === 'function' && !window.confirm(`'${hostname}' 사이트 설정을 삭제하시겠습니까? 삭제 후 이 사이트는 전역 기본값을 따릅니다.`)) {
    return;
  }
  await writeDomainSettings((freshDomainSettings) => {
    const nextDomainSettings = { ...freshDomainSettings };
    delete nextDomainSettings[hostname];
    return nextDomainSettings;
  });
}

let reloadPromise = null;
function reload() {
  state.ocrOriginalText = '';
  state.ocrEditedText = '';
  state.ocrIsDirty = false;
  state.ocrPendingNewResult = null;
  state.ocrPendingNewResultText = null;
  state.ocrDismissedResultText = null;
  if (!reloadPromise) {
    reloadPromise = Promise.all([loadState(), loadOcrState(), loadOcrHistory()])
      .then(render)
      .finally(() => { reloadPromise = null; });
  }
  return reloadPromise;
}

elements.globalToggle.addEventListener('click', () => handleGlobalToggle().catch(console.error));
elements.optThemeDark?.addEventListener('click', () => handleThemeSelect(SHARED.THEME_DARK).catch(console.error));
elements.optThemeNeon?.addEventListener('click', () => handleThemeSelect(SHARED.THEME_NEON).catch(console.error));
elements.optThemeLight?.addEventListener('click', () => handleThemeSelect(SHARED.THEME_LIGHT).catch(console.error));
chrome.storage.onChanged.addListener((changes, areaName) => {
  if ((areaName === 'local' || areaName === 'sync') && (changes.enabled || changes.domainSettings)) {
    reload().catch(console.error);
  }
  if (areaName === 'local' && (changes[OCR_HISTORY.OCR_HISTORY_ENABLED_KEY] || changes[OCR_HISTORY.OCR_HISTORY_KEY])) {
    loadOcrHistory().catch(console.error);
  }
  if (areaName === 'session' && (
    changes[OCR_SESSION.LATEST_OCR_RESULT_KEY] ||
    changes[OCR_SESSION.LATEST_OCR_STATUS_KEY] ||
    changes[OCR_SESSION.LAST_REGION_RERUN_KEY]
  )) {
    state.ocr = OCR_SESSION.applyOcrSessionChanges(state.ocr, changes);
    renderOcrResult();
  }
});

attachOcrEditListeners();
reload().catch((error) => {
  console.error('[Right-click on Web] failed to load options', error);
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isAllowedFeatureKey,
    computeOptionsPresetEntry,
    computeFeatureToggleEntry,
    computePresetResetEntry,
    computeProfilePreservingEntry,
    featureLabelKorean,
    optionsPresetLabelKorean,
    showRowStatus,
    restoreRowStatus,
    withDomainSettingsLock,
    writeDomainSettings,
    updateDomainEntry,
    removeDomain,
    writeGlobalEnabled,
    DOMAIN_SETTINGS_LOCK_NAME
  };
}
