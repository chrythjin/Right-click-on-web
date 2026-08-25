'use strict';

const SHARED = globalThis.RIGHT_CLICK_ON_WEB_SHARED;
const OCR_SESSION = globalThis.RIGHT_CLICK_ON_WEB_OCR_SESSION_UTILS;
const OCR_HISTORY = globalThis.RIGHT_CLICK_ON_WEB_OCR_HISTORY;
const OCR_TEXT = globalThis.RIGHT_CLICK_ON_WEB_OCR_TEXT_UTILS;
const CORRECTION_KEY = 'rcowOcrCorrectionDictionary';
const CORRECTION_ENABLED_KEY = 'rcowOcrCorrectionEnabled';
const CORRECTION_MAX_ENTRIES = 200;
const CORRECTION_MAX_BYTES = 65536;
const UNDO_STACK_SIZE = 50;
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
  ocrLanguage: 'kor+eng',
  theme: SHARED.DEFAULT_THEME,
  ocrUndoStack: [],
  ocrRedoStack: [],
  ocrCorrectionEnabled: false,
  ocrCorrectionDictionary: [],
  ocrFindVisible: false,
  ocrFindCurrent: 0,
  ocrFindMatches: [],
  ocrCleanupRules: { ...OCR_TEXT.DEFAULT_CLEANUP_PLAN },
  videoSpeedSettings: { ...SHARED.DEFAULT_VIDEO_SPEED_SETTINGS }
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
  ocrConfidenceGrade: document.getElementById('ocrConfidenceGrade'),
  ocrConfidenceWarning: document.getElementById('ocrConfidenceWarning'),
  ocrCropSize: document.getElementById('ocrCropSize'),
  ocrDetailControls: document.getElementById('ocrDetailControls'),
  ocrDetailShowAverage: document.getElementById('ocrDetailShowAverage'),
  ocrDetailFilterLow: document.getElementById('ocrDetailFilterLow'),
  ocrDetailViewLines: document.getElementById('ocrDetailViewLines'),
  ocrDetailViewWords: document.getElementById('ocrDetailViewWords'),
  ocrDetailStale: document.getElementById('ocrDetailStale'),
  ocrDetailList: document.getElementById('ocrDetailList'),
  ocrDetailEmpty: document.getElementById('ocrDetailEmpty'),
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
  ocrRecommendationSection: document.getElementById('ocrRecommendationSection'),
  ocrRecommendationBtn: document.getElementById('ocrRecommendationBtn'),
  ocrRecommendationNote: document.getElementById('ocrRecommendationNote'),
  ocrHistorySaveBtn: document.getElementById('ocrHistorySaveBtn'),
  ocrHistorySaveNote: document.getElementById('ocrHistorySaveNote'),
  ocrHistoryToggle: document.getElementById('ocrHistoryToggle'),
  ocrHistoryControls: document.getElementById('ocrHistoryControls'),
  ocrHistorySearch: document.getElementById('ocrHistorySearch'),
  ocrHistoryList: document.getElementById('ocrHistoryList'),
  ocrHistoryDeleteAllBtn: document.getElementById('ocrHistoryDeleteAllBtn'),
  ocrHistoryDisableDeleteBtn: document.getElementById('ocrHistoryDisableDeleteBtn'),
  ocrHistoryStatus: document.getElementById('ocrHistoryStatus'),
  ocrCorrectionSection: document.getElementById('ocrCorrectionSection'),
  ocrCorrectionToggle: document.getElementById('ocrCorrectionToggle'),
  ocrCorrectionControls: document.getElementById('ocrCorrectionControls'),
  ocrCorrectionFrom: document.getElementById('ocrCorrectionFrom'),
  ocrCorrectionTo: document.getElementById('ocrCorrectionTo'),
  ocrCorrectionAddBtn: document.getElementById('ocrCorrectionAddBtn'),
  ocrCorrectionAddStatus: document.getElementById('ocrCorrectionAddStatus'),
  ocrCorrectionCount: document.getElementById('ocrCorrectionCount'),
  ocrCorrectionClearAllBtn: document.getElementById('ocrCorrectionClearAllBtn'),
  ocrCorrectionList: document.getElementById('ocrCorrectionList'),
  ocrCorrectionStatus: document.getElementById('ocrCorrectionStatus'),
  ocrCleanupRulesSection: document.getElementById('ocrCleanupRulesSection'),
  ocrCleanupToggleAllBtn: document.getElementById('ocrCleanupToggleAllBtn'),
  ocrCleanupRulesList: document.getElementById('ocrCleanupRulesList'),
  ocrCleanupPreviewBtn: document.getElementById('ocrCleanupPreviewBtn'),
  ocrCleanupApplyBtn: document.getElementById('ocrCleanupApplyBtn'),
  ocrCleanupPreviewArea: document.getElementById('ocrCleanupPreviewArea'),
  ocrCleanupPreviewText: document.getElementById('ocrCleanupPreviewText'),
  ocrCleanupStatus: document.getElementById('ocrCleanupStatus'),
  ocrUndoBtn: document.getElementById('ocrUndoBtn'),
  ocrRedoBtn: document.getElementById('ocrRedoBtn'),
  ocrApplyCorrectionBtn: document.getElementById('ocrApplyCorrectionBtn'),
  ocrFindReplaceRow: document.getElementById('ocrFindReplaceRow'),
  ocrFindInput: document.getElementById('ocrFindInput'),
  ocrReplaceInput: document.getElementById('ocrReplaceInput'),
  ocrFindPrevBtn: document.getElementById('ocrFindPrevBtn'),
  ocrFindNextBtn: document.getElementById('ocrFindNextBtn'),
  ocrFindCounter: document.getElementById('ocrFindCounter'),
  ocrReplaceCurrentBtn: document.getElementById('ocrReplaceCurrentBtn'),
  ocrReplaceAllBtn: document.getElementById('ocrReplaceAllBtn'),
  ocrLanguageKor: document.getElementById('ocrLanguageKor'),
  ocrLanguageEng: document.getElementById('ocrLanguageEng'),
  ocrLanguageStatus: document.getElementById('ocrLanguageStatus'),
  videoSpeedGlobalToggle: document.getElementById('videoSpeedGlobalToggle'),
  videoDefaultSpeedInput: document.getElementById('videoDefaultSpeedInput'),
  videoSpeedStepSelect: document.getElementById('videoSpeedStepSelect'),
  videoShowOsdCheckbox: document.getElementById('videoShowOsdCheckbox'),
  videoSpeedLockCheckbox: document.getElementById('videoSpeedLockCheckbox'),
  videoSpeedStatus: document.getElementById('videoSpeedStatus'),
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

  state.ocrLanguage = SHARED.normalizeOcrLanguage(settings.ocrLanguage);
  renderOcrLanguageCheckboxes();

  state.videoSpeedSettings = SHARED.normalizeVideoSpeedSettings(settings.videoSpeedSettings);
  renderVideoSpeedSettings();

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

function handleThemeKeydown(event) {
  const keyboard = globalThis.RIGHT_CLICK_ON_WEB_KEYBOARD_UTILS;
  if (!keyboard || typeof keyboard.getNextValueFromKeydown !== 'function') return;
  const buttons = [
    { el: elements.optThemeDark, id: SHARED.THEME_DARK },
    { el: elements.optThemeNeon, id: SHARED.THEME_NEON },
    { el: elements.optThemeLight, id: SHARED.THEME_LIGHT }
  ].filter(({ el }) => Boolean(el));
  const current = buttons.find(({ el }) => el === event.currentTarget);
  if (!current) return;
  const nextTheme = keyboard.getNextValueFromKeydown(buttons.map(({ id }) => id), current.id, event.key);
  if (!nextTheme) return;

  event.preventDefault();
  const next = buttons.find(({ id }) => id === nextTheme);
  if (!next) return;
  next.el.focus();
  handleThemeSelect(nextTheme).catch(console.error);
}

let videoSpeedSaveSequence = 0;
let videoSpeedSavePending = 0;
let videoSpeedStatusTimer = null;

function renderVideoSpeedSettings() {
  const s = state.videoSpeedSettings || SHARED.DEFAULT_VIDEO_SPEED_SETTINGS;
  elements.videoSpeedGlobalToggle.setAttribute('aria-pressed', String(s.enabled));
  elements.videoSpeedGlobalToggle.textContent = s.enabled ? 'ON' : 'OFF';
  elements.videoSpeedGlobalToggle.classList.toggle('is-off', !s.enabled);
  elements.videoDefaultSpeedInput.value = String(s.defaultSpeed || 1.0);
  elements.videoSpeedStepSelect.value = String(s.speedStep || 0.1);
  elements.videoShowOsdCheckbox.checked = Boolean(s.showOsd);
  elements.videoSpeedLockCheckbox.checked = Boolean(s.speedLock);
  elements.videoDefaultSpeedInput.disabled = !s.enabled;
  elements.videoSpeedStepSelect.disabled = !s.enabled;
  elements.videoShowOsdCheckbox.disabled = !s.enabled;
  elements.videoSpeedLockCheckbox.disabled = !s.enabled;
}

async function saveVideoSpeedSettings(patch) {
  const requestSequence = ++videoSpeedSaveSequence;
  videoSpeedSavePending += 1;
  state.videoSpeedSettings = SHARED.normalizeVideoSpeedSettings({
    ...state.videoSpeedSettings,
    ...patch
  });
  renderVideoSpeedSettings();
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'rcow:updateVideoSpeedSettings',
      payload: { patch }
    });
    if (!response?.ok) {
      throw new Error(response?.error || '동영상 배속 설정 저장에 실패했습니다.');
    }
    if (requestSequence !== videoSpeedSaveSequence) return;
    state.videoSpeedSettings = SHARED.normalizeVideoSpeedSettings(response.settings);
    renderVideoSpeedSettings();
    if (elements.videoSpeedStatus) {
      if (videoSpeedStatusTimer) clearTimeout(videoSpeedStatusTimer);
      elements.videoSpeedStatus.textContent = '동영상 배속 설정이 저장되었습니다.';
      videoSpeedStatusTimer = setTimeout(() => {
        if (elements.videoSpeedStatus) elements.videoSpeedStatus.textContent = '';
        videoSpeedStatusTimer = null;
      }, 2000);
    }
  } catch (err) {
    if (requestSequence !== videoSpeedSaveSequence) return;
    const settings = await SHARED.resolveSettings(SHARED.STORAGE_DEFAULTS);
    state.videoSpeedSettings = SHARED.normalizeVideoSpeedSettings(settings.videoSpeedSettings);
    renderVideoSpeedSettings();
    if (elements.videoSpeedStatus) {
      if (videoSpeedStatusTimer) {
        clearTimeout(videoSpeedStatusTimer);
        videoSpeedStatusTimer = null;
      }
      elements.videoSpeedStatus.textContent = '설정 저장 실패: ' + err.message;
    }
  } finally {
    videoSpeedSavePending -= 1;
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
const HIGH_CONFIDENCE_THRESHOLD = 85;

let ocrDetailShowAverage = false;
let ocrDetailFilterLow = false;
let ocrDetailView = 'lines';

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
  const result = OCR_TEXT.applyCleanupPlan(current, state.ocrCleanupRules);
  const cleaned = result.text;
  if (cleaned !== current) {
    pushUndo(current);
    elements.ocrEditedText.value = cleaned;
    state.ocrEditedText = cleaned;
    state.ocrIsDirty = cleaned !== state.ocrOriginalText;
    elements.ocrEditDirty.classList.toggle('is-hidden', !state.ocrIsDirty);
  }
}

function handleOcrRestore() {
  if (!elements.ocrEditedText) return;
  pushUndo(elements.ocrEditedText.value);
  elements.ocrEditedText.value = state.ocrOriginalText;
  state.ocrEditedText = state.ocrOriginalText;
  state.ocrIsDirty = false;
  state.ocrFindMatches = [];
  state.ocrFindCurrent = 0;
  state.ocrCleanupRules = { ...OCR_TEXT.DEFAULT_CLEANUP_PLAN };
  elements.ocrEditDirty.classList.add('is-hidden');
  elements.ocrFindReplaceRow?.classList.add('is-hidden');
  elements.ocrCleanupRulesSection?.classList.remove('is-hidden');
  if (elements.ocrFindInput) elements.ocrFindInput.value = '';
  if (elements.ocrReplaceInput) elements.ocrReplaceInput.value = '';
  updateFindCounter();
  renderUndoRedoButtons();
  renderCleanupRulesUI();
}

function handleEditedTextChange() {
  if (!elements.ocrEditedText) return;
  state.ocrEditedText = elements.ocrEditedText.value;
  state.ocrIsDirty = elements.ocrEditedText.value !== state.ocrOriginalText;
  elements.ocrEditDirty.classList.toggle('is-hidden', !state.ocrIsDirty);
  state.ocrRedoStack = [];
  renderUndoRedoButtons();
}

function pushUndo(text) {
  if (!text) return;
  if (state.ocrUndoStack.length >= UNDO_STACK_SIZE) {
    state.ocrUndoStack.shift();
  }
  state.ocrUndoStack.push(text);
  state.ocrRedoStack = [];
  renderUndoRedoButtons();
}

function renderUndoRedoButtons() {
  if (elements.ocrUndoBtn) {
    elements.ocrUndoBtn.disabled = state.ocrUndoStack.length === 0;
  }
  if (elements.ocrRedoBtn) {
    elements.ocrRedoBtn.disabled = state.ocrRedoStack.length === 0;
  }
}

function handleUndo() {
  if (state.ocrUndoStack.length === 0) return;
  const current = elements.ocrEditedText?.value || '';
  const previous = state.ocrUndoStack.pop();
  if (current !== previous) {
    state.ocrRedoStack.push(current);
  }
  if (elements.ocrEditedText) {
    elements.ocrEditedText.value = previous;
  }
  state.ocrEditedText = previous;
  state.ocrIsDirty = previous !== state.ocrOriginalText;
  elements.ocrEditDirty.classList.toggle('is-hidden', !state.ocrIsDirty);
  renderUndoRedoButtons();
}

function handleRedo() {
  if (state.ocrRedoStack.length === 0) return;
  const current = elements.ocrEditedText?.value || '';
  const next = state.ocrRedoStack.pop();
  if (current !== next) {
    state.ocrUndoStack.push(current);
  }
  if (elements.ocrEditedText) {
    elements.ocrEditedText.value = next;
  }
  state.ocrEditedText = next;
  state.ocrIsDirty = next !== state.ocrOriginalText;
  elements.ocrEditDirty.classList.toggle('is-hidden', !state.ocrIsDirty);
  renderUndoRedoButtons();
}

function renderCleanupRulesUI() {
  if (!elements.ocrCleanupRulesList) return;
  if (elements.ocrCleanupRulesList.children.length === 0) {
    const ruleLabels = {
      removeZeroWidthChars: '공백 문자 제거',
      normalizeSpaces: '공백 정규화',
      normalizePunctuationSpacing: '문장부호 간격',
      joinHyphenatedLines: '줄 끝 Hyphen 연결',
      joinWrappedParagraphs: '자동 줄 바꿈 연결',
      collapseBlankLines: '연속 빈 줄 축소'
    };
    for (const ruleKey of Object.keys(ruleLabels)) {
      const label = document.createElement('label');
      label.className = 'ocr-cleanup-rule-label';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'ocr-cleanup-rule-checkbox';
      cb.setAttribute('data-rule', ruleKey);
      cb.checked = Boolean(state.ocrCleanupRules[ruleKey]);
      cb.addEventListener('change', handleCleanupRuleToggle);
      label.append(cb, ruleLabels[ruleKey]);
      elements.ocrCleanupRulesList.append(label);
    }
  }
  const checkboxes = elements.ocrCleanupRulesList.querySelectorAll('.ocr-cleanup-rule-checkbox');
  for (const cb of checkboxes) {
    const rule = cb.getAttribute('data-rule');
    if (rule && Object.prototype.hasOwnProperty.call(state.ocrCleanupRules, rule)) {
      cb.checked = Boolean(state.ocrCleanupRules[rule]);
    }
  }
  const anyEnabled = Object.values(state.ocrCleanupRules).some(Boolean);
  if (elements.ocrCleanupPreviewBtn) elements.ocrCleanupPreviewBtn.disabled = !anyEnabled;
  if (elements.ocrCleanupApplyBtn) elements.ocrCleanupApplyBtn.disabled = !anyEnabled;
  if (elements.ocrCleanupPreviewArea) elements.ocrCleanupPreviewArea.classList.add('is-hidden');
}

function handleCleanupRuleToggle(e) {
  const cb = e.target;
  const rule = cb.getAttribute('data-rule');
  if (!rule || !Object.prototype.hasOwnProperty.call(state.ocrCleanupRules, rule)) return;
  state.ocrCleanupRules[rule] = cb.checked;
  const anyEnabled = Object.values(state.ocrCleanupRules).some(Boolean);
  if (elements.ocrCleanupPreviewBtn) elements.ocrCleanupPreviewBtn.disabled = !anyEnabled;
  if (elements.ocrCleanupApplyBtn) elements.ocrCleanupApplyBtn.disabled = !anyEnabled;
}

function handleCleanupToggleAll() {
  const anyDisabled = Object.values(state.ocrCleanupRules).some(v => !v);
  const newValue = anyDisabled;
  for (const rule of Object.keys(state.ocrCleanupRules)) {
    state.ocrCleanupRules[rule] = newValue;
  }
  renderCleanupRulesUI();
}

function handleCleanupPreview() {
  const current = elements.ocrEditedText?.value || '';
  const result = OCR_TEXT.applyCleanupPlan(current, state.ocrCleanupRules);
  if (elements.ocrCleanupPreviewText) {
    elements.ocrCleanupPreviewText.textContent = result.text || '(결과 없음)';
  }
  if (elements.ocrCleanupPreviewArea) elements.ocrCleanupPreviewArea.classList.remove('is-hidden');
  if (elements.ocrCleanupStatus) {
    if (result.appliedRules.length > 0) {
      elements.ocrCleanupStatus.textContent = `적용: ${result.appliedRules.join(', ')}`;
    } else {
      elements.ocrCleanupStatus.textContent = '변경 사항 없음';
    }
  }
}

function handleCleanupApply() {
  const current = elements.ocrEditedText?.value || '';
  pushUndo(current);
  const result = OCR_TEXT.applyCleanupPlan(current, state.ocrCleanupRules);
  const cleaned = result.text;
  if (elements.ocrEditedText) {
    elements.ocrEditedText.value = cleaned;
  }
  state.ocrEditedText = cleaned;
  state.ocrIsDirty = cleaned !== state.ocrOriginalText;
  elements.ocrEditDirty.classList.toggle('is-hidden', !state.ocrIsDirty);
  if (elements.ocrCleanupPreviewArea) elements.ocrCleanupPreviewArea.classList.add('is-hidden');
  if (elements.ocrCleanupStatus) {
    elements.ocrCleanupStatus.textContent = result.appliedRules.length > 0
      ? `규칙 적용 완료: ${result.appliedRules.join(', ')}`
      : '변경 사항 없음';
  }
}

function literalReplace(text, find, replace) {
  if (!find) return { result: text, count: 0 };
  let index = 0;
  let count = 0;
  const result = [];
  while (index < text.length) {
    const pos = text.indexOf(find, index);
    if (pos === -1) break;
    result.push(text.slice(index, pos), replace);
    index = pos + find.length;
    count++;
  }
  result.push(text.slice(index));
  return { result: result.join(''), count };
}

function ocrFind() {
  const find = elements.ocrFindInput?.value || '';
  if (!find) {
    state.ocrFindMatches = [];
    state.ocrFindCurrent = 0;
    updateFindCounter();
    return;
  }
  const text = elements.ocrEditedText?.value || '';
  const { result, count } = literalReplace(text, find, '\x00'.repeat(find.length));
  const positions = [];
  let pos = 0;
  while (pos < result.length) {
    pos = result.indexOf('\x00', pos);
    if (pos === -1) break;
    positions.push(pos);
    pos += find.length;
  }
  state.ocrFindMatches = positions;
  state.ocrFindCurrent = 0;
  updateFindCounter();
  if (state.ocrFindMatches.length > 0) {
    highlightFindMatch(0);
  }
}

function updateFindCounter() {
  if (!elements.ocrFindCounter) return;
  const count = state.ocrFindMatches.length;
  if (count === 0) {
    elements.ocrFindCounter.textContent = '';
  } else {
    elements.ocrFindCounter.textContent = `${state.ocrFindCurrent + 1}/${count}`;
  }
  if (elements.ocrFindPrevBtn) elements.ocrFindPrevBtn.disabled = count === 0;
  if (elements.ocrFindNextBtn) elements.ocrFindNextBtn.disabled = count === 0;
  if (elements.ocrReplaceCurrentBtn) elements.ocrReplaceCurrentBtn.disabled = count === 0;
  if (elements.ocrReplaceAllBtn) elements.ocrReplaceAllBtn.disabled = count === 0;
}

function highlightFindMatch(index) {
  updateFindCounter();
  const textarea = elements.ocrEditedText;
  const find = elements.ocrFindInput?.value || '';
  if (!textarea || !find) return;
  const pos = state.ocrFindMatches[index];
  if (typeof pos !== 'number' || pos < 0) return;
  if (typeof textarea.focus === 'function') textarea.focus();
  if (typeof textarea.setSelectionRange === 'function') {
    textarea.setSelectionRange(pos, pos + find.length);
  }
  try {
    const fullText = typeof textarea.value === 'string'
      ? textarea.value
      : (state.ocrEditedText || '');
    const linesBefore = fullText.slice(0, pos).split('\n').length - 1;
    const computed = typeof getComputedStyle === 'function'
      ? parseFloat(getComputedStyle(textarea).lineHeight)
      : NaN;
    const lineHeight = Number.isFinite(computed) && computed > 0 ? computed : 18;
    const viewHeight = typeof textarea.clientHeight === 'number' ? textarea.clientHeight : 0;
    const targetTop = Math.max(0, linesBefore * lineHeight - viewHeight / 2);
    if (Number.isFinite(targetTop)) textarea.scrollTop = targetTop;
  } catch (_) { }
}

function handleFindInput() {
  ocrFind();
}

function handleFindPrev() {
  if (state.ocrFindMatches.length === 0) return;
  state.ocrFindCurrent = (state.ocrFindCurrent - 1 + state.ocrFindMatches.length) % state.ocrFindMatches.length;
  highlightFindMatch(state.ocrFindCurrent);
}

function handleFindNext() {
  if (state.ocrFindMatches.length === 0) return;
  state.ocrFindCurrent = (state.ocrFindCurrent + 1) % state.ocrFindMatches.length;
  highlightFindMatch(state.ocrFindCurrent);
}

function handleReplaceCurrent() {
  const find = elements.ocrFindInput?.value || '';
  const replace = elements.ocrReplaceInput?.value || '';
  if (!find || state.ocrFindMatches.length === 0) return;
  const current = elements.ocrEditedText?.value || '';
  pushUndo(current);
  const pos = state.ocrFindMatches[state.ocrFindCurrent];
  const next = current.slice(0, pos) + replace + current.slice(pos + find.length);
  if (elements.ocrEditedText) elements.ocrEditedText.value = next;
  state.ocrEditedText = next;
  state.ocrIsDirty = next !== state.ocrOriginalText;
  elements.ocrEditDirty.classList.toggle('is-hidden', !state.ocrIsDirty);
  ocrFind();
}

function handleReplaceAll() {
  const find = elements.ocrFindInput?.value || '';
  const replace = elements.ocrReplaceInput?.value || '';
  if (!find) return;
  const current = elements.ocrEditedText?.value || '';
  pushUndo(current);
  const { result } = literalReplace(current, find, replace);
  if (elements.ocrEditedText) elements.ocrEditedText.value = result;
  state.ocrEditedText = result;
  state.ocrIsDirty = result !== state.ocrOriginalText;
  elements.ocrEditDirty.classList.toggle('is-hidden', !state.ocrIsDirty);
  ocrFind();
}

function renderCorrectionApplyButton() {
  if (!elements.ocrApplyCorrectionBtn) return;
  const enabled = state.ocrCorrectionEnabled && state.ocrCorrectionDictionary.length > 0;
  elements.ocrApplyCorrectionBtn.disabled = !enabled;
}

function handleApplyCorrection() {
  if (!state.ocrCorrectionEnabled || state.ocrCorrectionDictionary.length === 0) return;
  applyCorrectionToEdited();
}

async function loadCorrectionDictionary() {
  try {
    const result = await chrome.storage.local.get([CORRECTION_KEY, CORRECTION_ENABLED_KEY]);
    state.ocrCorrectionEnabled = result[CORRECTION_ENABLED_KEY] === true;
    const raw = result[CORRECTION_KEY];
    if (Array.isArray(raw)) {
      const valid = raw.slice(0, CORRECTION_MAX_ENTRIES).filter(e =>
        e && typeof e.from === 'string' && typeof e.to === 'string'
      );
      const bytes = new TextEncoder().encode(JSON.stringify(valid)).length;
      if (bytes > CORRECTION_MAX_BYTES) {
        let usedBytes = 2;
        const kept = [];
        for (const entry of valid) {
          const entryBytes = new TextEncoder().encode(JSON.stringify(entry)).length + (kept.length > 0 ? 1 : 0);
          if (usedBytes + entryBytes > CORRECTION_MAX_BYTES) break;
          usedBytes += entryBytes;
          kept.push(entry);
        }
        state.ocrCorrectionDictionary = kept;
      } else {
        state.ocrCorrectionDictionary = valid;
      }
    }
  } catch (_) {
    state.ocrCorrectionDictionary = [];
  }
}

async function saveCorrectionDictionary() {
  try {
    const serialized = state.ocrCorrectionDictionary;
    const bytes = new TextEncoder().encode(JSON.stringify(serialized)).length;
    if (bytes > CORRECTION_MAX_BYTES) {
      if (elements.ocrCorrectionAddStatus) {
        elements.ocrCorrectionAddStatus.textContent = `저장 용량 초과 (${bytes} > ${CORRECTION_MAX_BYTES})`;
      }
      return false;
    }
    await chrome.storage.local.set({ [CORRECTION_KEY]: serialized });
    return true;
  } catch (_) {
    return false;
  }
}

function renderCorrectionToggle() {
  if (state.ocrCorrectionEnabled) {
    elements.ocrCorrectionControls?.classList.remove('is-hidden');
  } else {
    elements.ocrCorrectionControls?.classList.add('is-hidden');
  }
  if (elements.ocrCorrectionToggle) {
    elements.ocrCorrectionToggle.textContent = state.ocrCorrectionEnabled ? 'ON' : 'OFF';
    elements.ocrCorrectionToggle.classList.toggle('is-off', !state.ocrCorrectionEnabled);
    elements.ocrCorrectionToggle.setAttribute('aria-pressed', String(state.ocrCorrectionEnabled));
  }
}

async function handleCorrectionToggle() {
  state.ocrCorrectionEnabled = !state.ocrCorrectionEnabled;
  renderCorrectionToggle();
  renderCorrectionApplyButton();
  try {
    await chrome.storage.local.set({ [CORRECTION_ENABLED_KEY]: state.ocrCorrectionEnabled });
  } catch (_) { }
}

function renderCorrectionList() {
  if (!elements.ocrCorrectionList) return;
  elements.ocrCorrectionList.replaceChildren();
  if (elements.ocrCorrectionCount) {
    elements.ocrCorrectionCount.textContent = `항목 ${state.ocrCorrectionDictionary.length} / ${CORRECTION_MAX_ENTRIES}`;
  }
  for (const [index, entry] of state.ocrCorrectionDictionary.entries()) {
    const item = document.createElement('div');
    item.className = 'ocr-correction-entry';
    const from = document.createElement('span');
    from.className = 'ocr-correction-entry-from';
    from.textContent = entry.from;
    const arrow = document.createElement('span');
    arrow.className = 'ocr-correction-entry-arrow';
    arrow.textContent = '→';
    const to = document.createElement('span');
    to.className = 'ocr-correction-entry-to';
    to.textContent = entry.to;
    const remove = document.createElement('button');
    remove.className = 'ocr-correction-entry-remove';
    remove.type = 'button';
    remove.textContent = '삭제';
    remove.addEventListener('click', () => handleCorrectionRemove(index));
    item.append(from, arrow, to, remove);
    elements.ocrCorrectionList.append(item);
  }
}

function handleCorrectionInputChange() {
  const from = elements.ocrCorrectionFrom?.value || '';
  const to = elements.ocrCorrectionTo?.value || '';
  if (elements.ocrCorrectionAddBtn) {
    elements.ocrCorrectionAddBtn.disabled = !from || !to;
  }
}

async function handleCorrectionAdd() {
  const from = elements.ocrCorrectionFrom?.value || '';
  const to = elements.ocrCorrectionTo?.value || '';
  if (!from || !to) return;
  if (state.ocrCorrectionDictionary.length >= CORRECTION_MAX_ENTRIES) {
    if (elements.ocrCorrectionAddStatus) {
      elements.ocrCorrectionAddStatus.textContent = `항목 수 초과 (${CORRECTION_MAX_ENTRIES}개 최대)`;
    }
    return;
  }
  const exists = state.ocrCorrectionDictionary.some(e => e.from === from);
  if (exists) {
    if (elements.ocrCorrectionAddStatus) {
      elements.ocrCorrectionAddStatus.textContent = `이미 존재하는 원문: "${from}"`;
    }
    return;
  }
  state.ocrCorrectionDictionary.push({ from, to });
  const saved = await saveCorrectionDictionary();
  if (saved) {
    if (elements.ocrCorrectionAddStatus) {
      elements.ocrCorrectionAddStatus.textContent = `"${from}" → "${to}" 추가됨`;
    }
    if (elements.ocrCorrectionFrom) elements.ocrCorrectionFrom.value = '';
    if (elements.ocrCorrectionTo) elements.ocrCorrectionTo.value = '';
    if (elements.ocrCorrectionAddBtn) elements.ocrCorrectionAddBtn.disabled = true;
    renderCorrectionList();
    renderCorrectionApplyButton();
  } else {
    state.ocrCorrectionDictionary.pop();
    if (elements.ocrCorrectionAddStatus) {
      elements.ocrCorrectionAddStatus.textContent = '저장 실패: 용량 초과 또는 다른 오류';
    }
  }
}

async function handleCorrectionRemove(index) {
  const entry = state.ocrCorrectionDictionary[index];
  if (!entry) return;
  state.ocrCorrectionDictionary.splice(index, 1);
  const saved = await saveCorrectionDictionary();
  if (saved) {
    if (elements.ocrCorrectionStatus) {
      elements.ocrCorrectionStatus.textContent = `"${entry.from}" 삭제됨`;
    }
    renderCorrectionList();
    renderCorrectionApplyButton();
  } else {
    state.ocrCorrectionDictionary.splice(index, 0, entry);
    if (elements.ocrCorrectionStatus) {
      elements.ocrCorrectionStatus.textContent = '삭제 실패';
    }
  }
}

async function handleCorrectionClearAll() {
  if (typeof window.confirm === 'function' && !window.confirm('모든 교정 항목을 삭제하시겠습니까?')) {
    return;
  }
  const previous = [...state.ocrCorrectionDictionary];
  state.ocrCorrectionDictionary = [];
  const saved = await saveCorrectionDictionary();
  if (saved) {
    if (elements.ocrCorrectionStatus) {
      elements.ocrCorrectionStatus.textContent = '모든 항목을 삭제했습니다.';
    }
    renderCorrectionList();
    renderCorrectionApplyButton();
  } else {
    state.ocrCorrectionDictionary = previous;
    if (elements.ocrCorrectionStatus) {
      elements.ocrCorrectionStatus.textContent = '삭제 실패';
    }
  }
}

function applyCorrectionToEdited() {
  if (!state.ocrCorrectionEnabled || state.ocrCorrectionDictionary.length === 0) return;
  const current = elements.ocrEditedText?.value || '';
  pushUndo(current);
  let text = current;
  for (const { from, to } of state.ocrCorrectionDictionary) {
    const { result } = literalReplace(text, from, to);
    text = result;
  }
  if (elements.ocrEditedText) elements.ocrEditedText.value = text;
  state.ocrEditedText = text;
  state.ocrIsDirty = text !== state.ocrOriginalText;
  elements.ocrEditDirty.classList.toggle('is-hidden', !state.ocrIsDirty);
  if (elements.ocrCorrectionStatus) {
    elements.ocrCorrectionStatus.textContent = '교정 사전 적용 완료';
  }
}

function renderOcrLanguageCheckboxes() {
  const list = SHARED.ocrLanguageToList(state.ocrLanguage);
  if (elements.ocrLanguageKor) elements.ocrLanguageKor.checked = list.includes('kor');
  if (elements.ocrLanguageEng) elements.ocrLanguageEng.checked = list.includes('eng');
}

async function handleOcrLanguageChange(changedElement) {
  const list = [];
  if (elements.ocrLanguageKor?.checked) list.push('kor');
  if (elements.ocrLanguageEng?.checked) list.push('eng');
  if (list.length === 0) {
    if (changedElement) changedElement.checked = true;
    if (elements.ocrLanguageStatus) {
      elements.ocrLanguageStatus.textContent = '최소 1개의 언어를 선택해야 합니다.';
    }
    renderOcrLanguageCheckboxes();
    return;
  }
  state.ocrLanguage = SHARED.ocrLanguagesToSetting(list);
  try {
    await SHARED.safeSyncSet({ ocrLanguage: state.ocrLanguage }, chrome.storage.local);
    if (elements.ocrLanguageStatus) {
      elements.ocrLanguageStatus.textContent = '저장됨 — 다음 OCR 인식부터 적용됩니다.';
    }
  } catch (_) {
    if (elements.ocrLanguageStatus) {
      elements.ocrLanguageStatus.textContent = '언어 설정을 저장하지 못했습니다.';
    }
  }
  renderOcrLanguageCheckboxes();
}

function setupOcrLanguageControls() {
  elements.ocrLanguageKor?.addEventListener('change', () => handleOcrLanguageChange(elements.ocrLanguageKor));
  elements.ocrLanguageEng?.addEventListener('change', () => handleOcrLanguageChange(elements.ocrLanguageEng));
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
    state.ocrUndoStack = [];
    state.ocrRedoStack = [];
    state.ocrFindMatches = [];
    state.ocrFindCurrent = 0;
    state.ocrCleanupRules = { ...OCR_TEXT.DEFAULT_CLEANUP_PLAN };
    if (elements.ocrEditedText) elements.ocrEditedText.value = state.ocrEditedText;
    if (elements.ocrOriginalText) elements.ocrOriginalText.textContent = state.ocrOriginalText;
    if (elements.ocrEditDirty) elements.ocrEditDirty.classList.add('is-hidden');
    elements.ocrNewResultBanner?.classList.add('is-hidden');
    elements.ocrFindReplaceRow?.classList.add('is-hidden');
    elements.ocrCleanupRulesSection?.classList.remove('is-hidden');
    renderOcrConfidenceGrade(Math.round(state.ocrDisplayedResult?.confidence?.average || 0));
    renderOcrDetailPanel();
    renderUndoRedoButtons();
    renderCleanupRulesUI();
    if (elements.ocrFindInput) elements.ocrFindInput.value = '';
    if (elements.ocrReplaceInput) elements.ocrReplaceInput.value = '';
    updateFindCounter();
    checkOcrContextStale().catch(() => {});
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

function renderOcrRecommendation() {
  const result = state.ocrDisplayedResult;
  const profile = result?.recommendedProfile;
  const available = Boolean(profile && result?.metadata && !state.ocrRerunInFlight);
  elements.ocrRecommendationSection.classList.toggle('is-hidden', !profile);
  elements.ocrRecommendationBtn.disabled = !available;
  elements.ocrRecommendationNote.textContent = profile
    ? `시도하지 않은 최저 비용 전처리 ${profile}을(를) 새 캡처로 다시 실행합니다.`
    : '';
}

async function handleOcrRecommendation() {
  const result = state.ocrDisplayedResult;
  if (state.ocrRerunInFlight || !result?.recommendedProfile || !result?.metadata) return;
  state.ocrRerunInFlight = true;
  renderOcrRerun();
  renderOcrRecommendation();
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'rcow:rerunOcrBboxOnActiveTab',
      bbox: { x0: 0, y0: 0, x1: result.crop.width, y1: result.crop.height },
      preprocessingProfile: result.recommendedProfile
    });
    if (!response?.ok) throw new Error(response?.error || '추천 OCR 재인식에 실패했습니다.');
  } catch (error) {
    showOcrCopyToast(error.message || '추천 OCR 재인식에 실패했습니다.', true);
  } finally {
    state.ocrRerunInFlight = false;
    renderOcrRerun();
    renderOcrRecommendation();
  }
}

async function handleOcrBboxRerun(bbox) {
  const result = state.ocrDisplayedResult;
  const profile = result?.recommendedProfile || result?.preprocessing?.profile;
  if (state.ocrRerunInFlight || !result?.metadata || !profile) return;
  state.ocrRerunInFlight = true;
  renderOcrRerun();
  renderOcrRecommendation();
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'rcow:rerunOcrBboxOnActiveTab', bbox, preprocessingProfile: profile
    });
    if (!response?.ok) throw new Error(response?.error || '선택 영역 OCR 재인식에 실패했습니다.');
  } catch (error) {
    showOcrCopyToast(error.message || '선택 영역 OCR 재인식에 실패했습니다.', true);
  } finally {
    state.ocrRerunInFlight = false;
    renderOcrRerun();
    renderOcrRecommendation();
  }
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

function captureUndoBeforeInput(e) {
  if (e.inputType === 'insertText' || e.inputType === 'deleteContentBackward' ||
      e.inputType === 'deleteContentForward' || e.inputType === 'insertFromPaste' ||
      e.inputType === 'insertFromDrop' || e.inputType === 'historyUndo' ||
      e.inputType === 'historyRedo' || e.inputType === 'insertLineBreak' ||
      e.inputType === 'insertParagraph' || e.inputType === 'formatSetBlockTextDirection' ||
      e.inputType === '' || !e.inputType) {
    const prev = elements.ocrEditedText?.value || '';
    if (state.ocrUndoStack.length === 0 || state.ocrUndoStack[state.ocrUndoStack.length - 1] !== prev) {
      pushUndo(prev);
    }
  }
}

function attachOcrEditListeners() {
  elements.ocrCopyBtn?.addEventListener('click', handleOcrCopy);
  elements.ocrSelectAllBtn?.addEventListener('click', handleOcrSelectAll);
  elements.ocrCleanupBtn?.addEventListener('click', handleOcrCleanup);
  elements.ocrRestoreBtn?.addEventListener('click', handleOcrRestore);
  elements.ocrEditedText?.addEventListener('beforeinput', captureUndoBeforeInput);
  elements.ocrEditedText?.addEventListener('input', handleEditedTextChange);
  elements.ocrAcceptNewBtn?.addEventListener('click', handleOcrAcceptNew);
  elements.ocrDismissBannerBtn?.addEventListener('click', handleOcrDismissBanner);
  elements.ocrRerunBtn?.addEventListener('click', () => handleOcrRerun());
  elements.ocrRecommendationBtn?.addEventListener('click', () => handleOcrRecommendation());
  elements.ocrHistorySaveBtn?.addEventListener('click', () => handleOcrHistorySave());
  elements.ocrHistoryToggle?.addEventListener('click', () => handleOcrHistoryToggle());
  elements.ocrHistoryDeleteAllBtn?.addEventListener('click', () => handleOcrHistoryDeleteAll());
  elements.ocrHistoryDisableDeleteBtn?.addEventListener('click', () => handleOcrHistoryDisableDelete());
  elements.ocrHistorySearch?.addEventListener('input', renderOcrHistory);
  elements.ocrCorrectionToggle?.addEventListener('click', () => handleCorrectionToggle());
  elements.ocrCorrectionAddBtn?.addEventListener('click', () => handleCorrectionAdd());
  elements.ocrCorrectionClearAllBtn?.addEventListener('click', () => handleCorrectionClearAll());
  elements.ocrCorrectionFrom?.addEventListener('input', () => handleCorrectionInputChange());
  elements.ocrCorrectionTo?.addEventListener('input', () => handleCorrectionInputChange());
  elements.ocrCleanupToggleAllBtn?.addEventListener('click', () => handleCleanupToggleAll());
  elements.ocrCleanupPreviewBtn?.addEventListener('click', () => handleCleanupPreview());
  elements.ocrCleanupApplyBtn?.addEventListener('click', () => handleCleanupApply());
  elements.ocrUndoBtn?.addEventListener('click', () => handleUndo());
  elements.ocrRedoBtn?.addEventListener('click', () => handleRedo());
  elements.ocrApplyCorrectionBtn?.addEventListener('click', () => handleApplyCorrection());
  elements.ocrFindInput?.addEventListener('input', () => handleFindInput());
  elements.ocrReplaceInput?.addEventListener('input', () => {});
  elements.ocrFindPrevBtn?.addEventListener('click', () => handleFindPrev());
  elements.ocrFindNextBtn?.addEventListener('click', () => handleFindNext());
  elements.ocrReplaceCurrentBtn?.addEventListener('click', () => handleReplaceCurrent());
  elements.ocrReplaceAllBtn?.addEventListener('click', () => handleReplaceAll());
  elements.ocrDetailShowAverage?.addEventListener('change', (e) => {
    ocrDetailShowAverage = e.target.checked;
    renderOcrDetailPanel();
  });
  elements.ocrDetailFilterLow?.addEventListener('change', (e) => {
    ocrDetailFilterLow = e.target.checked;
    renderOcrDetailPanel();
  });
  elements.ocrDetailViewLines?.addEventListener('click', () => {
    ocrDetailView = 'lines';
    if (elements.ocrDetailViewLines) elements.ocrDetailViewLines.setAttribute('aria-pressed', 'true');
    if (elements.ocrDetailViewWords) elements.ocrDetailViewWords.setAttribute('aria-pressed', 'false');
    renderOcrDetailPanel();
  });
  elements.ocrDetailViewWords?.addEventListener('click', () => {
    ocrDetailView = 'words';
    if (elements.ocrDetailViewLines) elements.ocrDetailViewLines.setAttribute('aria-pressed', 'false');
    if (elements.ocrDetailViewWords) elements.ocrDetailViewWords.setAttribute('aria-pressed', 'true');
    renderOcrDetailPanel();
  });
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
  if (typeof window.confirm === 'function' && !window.confirm('저장된 OCR 기록을 모두 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
    return;
  }
  try {
    await sendOcrHistoryMessage({ type: 'rcow:deleteAllOcrHistory' });
    elements.ocrHistoryStatus.textContent = 'OCR 기록을 모두 삭제했습니다.';
  } catch (error) { elements.ocrHistoryStatus.textContent = `OCR 기록 삭제 실패: ${error.message}`; }
}

async function handleOcrHistoryDisableDelete() {
  if (typeof window.confirm === 'function' && !window.confirm('OCR 기록을 끄고 저장된 기록을 모두 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
    return;
  }
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

function renderOcrConfidenceGrade(average) {
  const gradeEl = elements.ocrConfidenceGrade;
  if (!gradeEl) return;
  const grade = average >= HIGH_CONFIDENCE_THRESHOLD
    ? 'high'
    : average >= LOW_CONFIDENCE_THRESHOLD
      ? 'medium'
      : 'low';
  const label = grade === 'high' ? '높음' : grade === 'medium' ? '보통' : '낮음';
  gradeEl.textContent = label;
  gradeEl.setAttribute('data-grade', grade);
  gradeEl.setAttribute('aria-label', `신뢰도 등급: ${label}`);
}

function getConfidenceItemGrade(confidence) {
  return confidence >= HIGH_CONFIDENCE_THRESHOLD
    ? 'high'
    : confidence >= LOW_CONFIDENCE_THRESHOLD
      ? 'medium'
      : 'low';
}

function compareViewportStale(normalized, vpResponse) {
  if (!vpResponse || vpResponse.ok !== true || !vpResponse.viewport) {
    return '⚠️ 원래 탭에서 다시 시도하세요.';
  }
  const currentViewport = vpResponse.viewport;
  if (
    !Number.isFinite(currentViewport.width) || currentViewport.width <= 0 ||
    !Number.isFinite(currentViewport.height) || currentViewport.height <= 0 ||
    !Number.isFinite(currentViewport.dpr) || currentViewport.dpr <= 0 ||
    currentViewport.width !== normalized.viewport.width ||
    currentViewport.height !== normalized.viewport.height ||
    currentViewport.dpr !== normalized.devicePixelRatio
  ) {
    return '⚠️ 원래 탭에서 다시 시도하세요.';
  }
  return null;
}

function createCheckOcrContextStale({ elements, state, OCR_SESSION, chrome, Date: DateCls, URL }) {
  return async function checkOcrContextStaleImpl() {
    const staleEl = elements.ocrDetailStale;
    if (!staleEl) return;
    const rerunMeta = state.ocr.lastRegionRerun;
    if (!rerunMeta || !state.ocrDisplayedResult?.detail) {
      staleEl.classList.add('is-hidden');
      staleEl.textContent = '';
      return;
    }
    const normalized = OCR_SESSION.normalizeLastRegionRerun(rerunMeta);
    if (!normalized) {
      staleEl.classList.add('is-hidden');
      staleEl.textContent = '';
      return;
    }
    if (!normalized.tabId || !normalized.hostname) {
      staleEl.classList.add('is-hidden');
      staleEl.textContent = '';
      return;
    }
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab?.url) {
        staleEl.classList.add('is-hidden');
        staleEl.textContent = '';
        return;
      }
      const hostname = tab.url && typeof tab.url === 'string'
        ? new URL(tab.url).hostname
        : '';
      if (tab.id !== normalized.tabId || hostname !== normalized.hostname) {
        staleEl.textContent = '⚠️ 원래 탭에서 다시 시도하세요.';
        staleEl.classList.remove('is-hidden');
        return;
      }
      const now = DateCls.now();
      if (now - normalized.timestamp > OCR_SESSION.MAX_CAPTURE_AGE_MS) {
        staleEl.textContent = '⚠️ 저장된 OCR 결과가 너무 오래되어 다시 인식할 수 없습니다.';
        staleEl.classList.remove('is-hidden');
        return;
      }
      if (normalized.viewport && normalized.devicePixelRatio != null) {
        let vpResponse;
        try {
          vpResponse = await chrome.tabs.sendMessage(normalized.tabId, { type: 'rcow:getViewport' });
        } catch (_) {
          staleEl.textContent = '⚠️ 원래 탭에서 다시 시도하세요.';
          staleEl.classList.remove('is-hidden');
          return;
        }
        const guidance = compareViewportStale(normalized, vpResponse);
        if (guidance) {
          staleEl.textContent = guidance;
          staleEl.classList.remove('is-hidden');
          return;
        }
      }
      staleEl.classList.add('is-hidden');
      staleEl.textContent = '';
    } catch (_) {
      staleEl.classList.add('is-hidden');
      staleEl.textContent = '';
    }
  };
}

const checkOcrContextStale = createCheckOcrContextStale({ elements, state, OCR_SESSION, chrome, Date, URL });

const MAX_DETAIL_ITEMS = 200;

function renderOcrDetailPanel() {
  const result = state.ocrDisplayedResult;
  const detail = result?.detail;

  if (!elements.ocrDetailControls || !elements.ocrDetailList || !elements.ocrDetailEmpty) return;

  if (!ocrDetailShowAverage || !detail || (!detail.lines?.length && !detail.words?.length)) {
    elements.ocrDetailControls.classList.add('is-hidden');
    return;
  }

  elements.ocrDetailControls.classList.remove('is-hidden');

  const items = ocrDetailView === 'words'
    ? (detail.words || [])
    : (detail.lines || []);

  let filtered = ocrDetailFilterLow
    ? items.filter((item) => item.confidence < LOW_CONFIDENCE_THRESHOLD)
    : items;

  if (filtered.length === 0) {
    elements.ocrDetailList.textContent = '';
    elements.ocrDetailEmpty.classList.remove('is-hidden');
    return;
  }

  elements.ocrDetailEmpty.classList.add('is-hidden');

  const capped = filtered.length > MAX_DETAIL_ITEMS
    ? filtered.slice(0, MAX_DETAIL_ITEMS)
    : filtered;

  const fragment = document.createDocumentFragment();
  for (const item of capped) {
    const grade = getConfidenceItemGrade(item.confidence);
    const itemEl = document.createElement('div');
    itemEl.className = `ocr-detail-item ocr-detail-item--${grade}`;

    const confEl = document.createElement('span');
    confEl.className = `ocr-detail-confidence ocr-detail-confidence--${grade}`;
    confEl.textContent = `${item.confidence}%`;
    confEl.setAttribute('aria-label', `신뢰도 ${item.confidence}%`);

    const textEl = document.createElement('span');
    textEl.className = 'ocr-detail-text';
    textEl.textContent = item.text;

    itemEl.appendChild(confEl);
    itemEl.appendChild(textEl);
    if (item.confidence < LOW_CONFIDENCE_THRESHOLD && result?.metadata) {
      const retry = document.createElement('button');
      retry.className = 'ocr-detail-retry-btn';
      retry.type = 'button';
      retry.textContent = '이 영역 재인식';
      retry.addEventListener('click', () => handleOcrBboxRerun(item.bbox));
      itemEl.appendChild(retry);
    }
    fragment.appendChild(itemEl);
  }

  elements.ocrDetailList.textContent = '';
  elements.ocrDetailList.appendChild(fragment);
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
  renderOcrRecommendation();

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
    ocrDetailShowAverage = false;
    ocrDetailFilterLow = false;
    ocrDetailView = 'lines';
    if (elements.ocrDetailShowAverage) elements.ocrDetailShowAverage.checked = false;
    if (elements.ocrDetailFilterLow) elements.ocrDetailFilterLow.checked = false;
    if (elements.ocrDetailViewLines) elements.ocrDetailViewLines.setAttribute('aria-pressed', 'true');
    if (elements.ocrDetailViewWords) elements.ocrDetailViewWords.setAttribute('aria-pressed', 'false');
    elements.ocrConfidenceGrade?.removeAttribute('data-grade');
    elements.ocrConfidenceGrade.textContent = '';
    elements.ocrDetailControls?.classList.add('is-hidden');
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

  renderOcrConfidenceGrade(confidence);
  renderOcrDetailPanel();
  checkOcrContextStale().catch(() => {});

  elements.ocrEditArea?.classList.remove('is-hidden');
  elements.ocrEmptyState?.classList.add('is-hidden');
  elements.ocrCleanupRulesSection?.classList.remove('is-hidden');
  elements.ocrFindReplaceRow?.classList.add('is-hidden');
  renderOcrRerun();
  renderOcrRecommendation();
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

const TRANSFER = globalThis.RIGHT_CLICK_ON_WEB_SETTINGS_TRANSFER;

let transferPendingPlan = null;
let transferBlobUrl = null;

function showTransferStatus(message, kind = 'info') {
  const el = document.getElementById('transferStatus');
  if (!el) return;
  el.textContent = message;
  el.className = 'site-row-status';
  el.classList.add(`row-${kind}`);
  if (kind === 'success') {
    setTimeout(() => { el.textContent = ''; }, 3000);
  }
}

function renderTransferPreview(plan) {
  const preview = document.getElementById('transferPreview');
  const statsEl = document.getElementById('transferPreviewStats');
  const warningEl = document.getElementById('transferPreviewWarning');
  if (!preview || !statsEl) return;
  preview.classList.remove('is-hidden');
  statsEl.replaceChildren();
  const summary = plan.summary;
  if (summary.added.length > 0) {
    const badge = document.createElement('span');
    badge.className = 'transfer-preview-stat added';
    badge.textContent = `추가 ${summary.added.length}개`;
    statsEl.append(badge);
  }
  if (summary.changed.length > 0) {
    const badge = document.createElement('span');
    badge.className = 'transfer-preview-stat changed';
    badge.textContent = `변경 ${summary.changed.length}개`;
    statsEl.append(badge);
  }
  if (plan.mode === 'replace') {
    const badge = document.createElement('span');
    badge.className = 'transfer-preview-stat ignored';
    badge.textContent = `삭제 ${summary.removed.length}개`;
    statsEl.append(badge);
  }
  if (summary.ignored && summary.ignored.length > 0) {
    const badge = document.createElement('span');
    badge.className = 'transfer-preview-stat ignored';
    badge.textContent = `무시 ${summary.ignored.length}개`;
    statsEl.append(badge);
  }
  if (plan.mode === 'replace') {
    warningEl.classList.remove('is-hidden');
    warningEl.textContent = `전체 교체를 선택하셨습니다. 기존 모든 사이트 설정이 삭제됩니다.`;
  } else {
    warningEl.classList.add('is-hidden');
  }
}

function hideTransferPreview() {
  const preview = document.getElementById('transferPreview');
  if (preview) preview.classList.add('is-hidden');
  transferPendingPlan = null;
}

async function handleTransferExport() {
  try {
    const fresh = await SHARED.resolveSettings(SHARED.STORAGE_DEFAULTS);
    const backup = TRANSFER.exportSettings({
      enabled: fresh.enabled,
      theme: fresh.theme,
      ocrLanguage: fresh.ocrLanguage,
      domainSettings: fresh.domainSettings
    });
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    if (transferBlobUrl) {
      URL.revokeObjectURL(transferBlobUrl);
    }
    const downloadUrl = URL.createObjectURL(blob);
    transferBlobUrl = downloadUrl;
    const anchor = document.createElement('a');
    anchor.href = downloadUrl;
    const date = new Date().toISOString().slice(0, 10);
    anchor.download = `right-click-on-web-backup-${date}.json`;
    document.body.append(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(downloadUrl);
    if (transferBlobUrl === downloadUrl) transferBlobUrl = null;
    showTransferStatus('설정을 내보냈습니다.', 'success');
  } catch (err) {
    showTransferStatus(`내보내기 실패: ${err.message}`, 'error');
  }
}

async function handleTransferImport() {
  const input = document.getElementById('transferFileInput');
  if (!input) return;
  input.value = '';
  input.click();
}

async function handleTransferFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const text = e.target && e.target.result;
    if (typeof text !== 'string') {
      showTransferStatus('파일을 읽을 수 없습니다.', 'error');
      return;
    }
    const validated = TRANSFER.validateSettingsBackup(text);
    if (!validated.ok) {
      showTransferStatus(`유효하지 않은 백업 파일: ${validated.code}`, 'error');
      return;
    }
    try {
      const fresh = await SHARED.resolveSettings(SHARED.STORAGE_DEFAULTS);
      const plan = TRANSFER.planSettingsImport(validated.value, {
        enabled: fresh.enabled,
        theme: fresh.theme,
        ocrLanguage: fresh.ocrLanguage,
        domainSettings: fresh.domainSettings
      });
      if (!plan.ok) {
        showTransferStatus(`가져오기 계획 오류: ${plan.code}`, 'error');
        return;
      }
      plan._backup = validated.value;
      transferPendingPlan = plan;
      renderTransferPreview(plan);
    } catch (err) {
      showTransferStatus(`가져오기 실패: ${err.message}`, 'error');
    }
  };
  reader.readAsText(file);
}

async function handleTransferConfirm() {
  if (!transferPendingPlan || !transferPendingPlan._backup) return;
  const replaceRadio = document.getElementById('transferModeReplace');
  const isReplace = replaceRadio && replaceRadio.checked;
  if (isReplace) {
    const dialog = document.getElementById('replaceImportConfirmDialog');
    if (dialog) dialog.classList.remove('is-hidden');
    return;
  }
  await executeReplaceImport(false);
}

async function executeReplaceImport(isReplace) {
  if (!transferPendingPlan || !transferPendingPlan._backup) return;
  const dialog = document.getElementById('replaceImportConfirmDialog');
  if (dialog) dialog.classList.add('is-hidden');
  try {
    const fresh = await SHARED.resolveSettings(SHARED.STORAGE_DEFAULTS);
    const plan = TRANSFER.planSettingsImport(transferPendingPlan._backup, {
      enabled: fresh.enabled,
      theme: fresh.theme,
      ocrLanguage: fresh.ocrLanguage,
      domainSettings: fresh.domainSettings
    }, { replace: isReplace });
    if (!plan.ok) {
      showTransferStatus(`가져오기 실행 오류: ${plan.code}`, 'error');
      return;
    }
    if (plan.settings.domainSettings) {
      await writeDomainSettings(() => plan.settings.domainSettings);
    }
    if (Object.prototype.hasOwnProperty.call(plan.settings, 'enabled')) {
      await writeGlobalEnabled(plan.settings.enabled);
    }
    if (Object.prototype.hasOwnProperty.call(plan.settings, 'theme') && plan.settings.theme !== state.theme) {
      await handleThemeSelect(plan.settings.theme);
    }
    if (Object.prototype.hasOwnProperty.call(plan.settings, 'ocrLanguage')) {
      await SHARED.safeSyncSet({ ocrLanguage: plan.settings.ocrLanguage }, chrome.storage.local);
    }
    hideTransferPreview();
    showTransferStatus('설정을 가져왔습니다.', 'success');
    await reloadSettings();
  } catch (err) {
    showTransferStatus(`가져오기 실패: ${err.message}`, 'error');
  }
}

function handleTransferCancel() {
  hideTransferPreview();
  showTransferStatus('', 'info');
  const dialog = document.getElementById('replaceImportConfirmDialog');
  if (dialog) dialog.classList.add('is-hidden');
}

async function handleResetCurrentSite() {
  let currentHost;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      currentHost = SHARED.getHostname(tab.url);
    }
  } catch (_) {
    // activeTab permission does not grant access when options page was opened directly
  }
  if (!currentHost) {
    showTransferStatus('현재 사이트는 팝업에서만 초기화할 수 있습니다.', 'warn');
    return;
  }
  if (typeof window.confirm === 'function' && !window.confirm(`'${currentHost}' 사이트 설정을 초기화하시겠습니까?`)) {
    return;
  }
  try {
    await removeDomain(currentHost);
    showTransferStatus(`'${currentHost}' 설정을 초기화했습니다.`, 'success');
    await reloadSettings();
  } catch (err) {
    showTransferStatus(`초기화 실패: ${err.message}`, 'error');
  }
}

async function handleResetAllSites() {
  if (typeof window.confirm === 'function' && !window.confirm('모든 사이트 설정을 초기화하시겠습니까?')) {
    return;
  }
  try {
    await writeDomainSettings(() => ({}));
    showTransferStatus('모든 사이트 설정을 초기화했습니다.', 'success');
    await reloadSettings();
  } catch (err) {
    showTransferStatus(`초기화 실패: ${err.message}`, 'error');
  }
}

async function handleResetUiPrefs() {
  if (typeof window.confirm === 'function' && !window.confirm('UI 환경설정(테마)을 기본값(다크)으로 초기화하시겠습니까?')) {
    return;
  }
  try {
    await handleThemeSelect(SHARED.DEFAULT_THEME);
    showTransferStatus('UI 환경설정을 초기화했습니다.', 'success');
    await reloadSettings();
  } catch (err) {
    showTransferStatus(`초기화 실패: ${err.message}`, 'error');
  }
}

function handleResetAllSettings() {
  const dialog = document.getElementById('transferConfirmDialog');
  if (dialog) dialog.classList.remove('is-hidden');
}

async function executeResetAllSettings() {
  const dialog = document.getElementById('transferConfirmDialog');
  if (dialog) dialog.classList.add('is-hidden');
  try {
    await writeDomainSettings(() => ({}));
    await writeGlobalEnabled(SHARED.STORAGE_DEFAULTS.enabled);
    await handleThemeSelect(SHARED.DEFAULT_THEME);
    await SHARED.safeSyncSet({ ocrLanguage: SHARED.STORAGE_DEFAULTS.ocrLanguage }, chrome.storage.local);
    showTransferStatus('전체 설정을 초기화했습니다.', 'success');
    await reloadSettings();
  } catch (err) {
    showTransferStatus(`초기화 실패: ${err.message}`, 'error');
  }
}

function handleDialogCancel() {
  const dialog = document.getElementById('transferConfirmDialog');
  if (dialog) dialog.classList.add('is-hidden');
}

function setupTransferListeners() {
  if (typeof TRANSFER === 'undefined') return;
  document.getElementById('transferExportBtn')?.addEventListener('click', handleTransferExport);
  const importBtn = document.getElementById('transferImportBtn');
  const fileInput = document.getElementById('transferFileInput');
  importBtn?.addEventListener('click', handleTransferImport);
  fileInput?.addEventListener('change', handleTransferFileSelected);
  document.getElementById('transferConfirmBtn')?.addEventListener('click', handleTransferConfirm);
  document.getElementById('transferCancelBtn')?.addEventListener('click', handleTransferCancel);
  document.getElementById('resetCurrentSiteBtn')?.addEventListener('click', handleResetCurrentSite);
  document.getElementById('resetAllSitesBtn')?.addEventListener('click', handleResetAllSites);
  document.getElementById('resetUiPrefsBtn')?.addEventListener('click', handleResetUiPrefs);
  document.getElementById('resetAllSettingsBtn')?.addEventListener('click', handleResetAllSettings);
  document.getElementById('dialogConfirmBtn')?.addEventListener('click', executeResetAllSettings);
  document.getElementById('dialogCancelBtn')?.addEventListener('click', handleDialogCancel);
  document.getElementById('replaceImportConfirmBtn')?.addEventListener('click', () => executeReplaceImport(true));
  document.getElementById('replaceImportCancelBtn')?.addEventListener('click', () => {
    const dialog = document.getElementById('replaceImportConfirmDialog');
    if (dialog) dialog.classList.add('is-hidden');
  });
}

let reloadSettingsPromise = null;
function reloadSettings() {
  if (!reloadSettingsPromise) {
    reloadSettingsPromise = loadState()
      .then(() => {
        renderGlobalState();
        renderSites();
        renderSyncUsage();
        renderSidePanelHint();
      })
      .finally(() => { reloadSettingsPromise = null; });
  }
  return reloadSettingsPromise;
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
elements.optThemeDark?.addEventListener('keydown', handleThemeKeydown);
elements.optThemeNeon?.addEventListener('keydown', handleThemeKeydown);
elements.optThemeLight?.addEventListener('keydown', handleThemeKeydown);
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' || areaName === 'sync') {
    if (changes.theme) {
      reloadSettings().catch(console.error);
    }
    if (changes.enabled || changes.domainSettings) {
      reloadSettings().catch(console.error);
    }
    if (changes.videoSpeedSettings) {
      if (videoSpeedSavePending === 0) {
        state.videoSpeedSettings = SHARED.normalizeVideoSpeedSettings(changes.videoSpeedSettings.newValue);
        renderVideoSpeedSettings();
      }
    }
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

function setupVideoSpeedListeners() {
  if (elements.videoSpeedGlobalToggle) {
    elements.videoSpeedGlobalToggle.addEventListener('click', () => {
      saveVideoSpeedSettings({
        enabled: !state.videoSpeedSettings.enabled
      }).catch(console.error);
    });
  }
  if (elements.videoDefaultSpeedInput) {
    elements.videoDefaultSpeedInput.addEventListener('change', () => {
      const rawValue = elements.videoDefaultSpeedInput.value.trim();
      const val = Number(rawValue);
      if (rawValue !== '' && Number.isFinite(val)) {
        saveVideoSpeedSettings({
          defaultSpeed: val
        }).catch(console.error);
      } else {
        renderVideoSpeedSettings();
      }
    });
  }
  if (elements.videoSpeedStepSelect) {
    elements.videoSpeedStepSelect.addEventListener('change', () => {
      const val = Number(elements.videoSpeedStepSelect.value);
      if (Number.isFinite(val)) {
        saveVideoSpeedSettings({
          speedStep: val
        }).catch(console.error);
      }
    });
  }
  if (elements.videoShowOsdCheckbox) {
    elements.videoShowOsdCheckbox.addEventListener('change', () => {
      saveVideoSpeedSettings({
        showOsd: elements.videoShowOsdCheckbox.checked
      }).catch(console.error);
    });
  }
  if (elements.videoSpeedLockCheckbox) {
    elements.videoSpeedLockCheckbox.addEventListener('change', () => {
      saveVideoSpeedSettings({
        speedLock: elements.videoSpeedLockCheckbox.checked
      }).catch(console.error);
    });
  }
}

attachOcrEditListeners();
setupOcrLanguageControls();
setupVideoSpeedListeners();
loadCorrectionDictionary().then(() => {
  renderCorrectionToggle();
  renderCorrectionList();
  renderCorrectionApplyButton();
});
renderCleanupRulesUI();
setupTransferListeners();
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
