// Right-click on Web — popup UI logic
//
// Responsibilities:
//   - Render global ON/OFF toggle (existing v0.2.0 behaviour)
//   - Render per-domain toggle for the active tab's hostname
//   - Render session-mode toggle (browser-session temporary activation)
//   - Sync the rendered state with chrome.storage changes that arrive
//     while the popup is open (e.g. user toggled global from keyboard
//     shortcut in a future version, or another popup instance updated
//     the domain)
//
// Shared helpers come from shared.js, loaded just before this file
// via popup.html <script src="shared.js">. chrome.tabs.query is used
// to resolve the current hostname (requires activeTab permission, see
// manifest.json).

'use strict';

const SHARED = globalThis.RIGHT_CLICK_ON_WEB_SHARED;

const state = {
  globalEnabled: true,
  hostname: '',
  domainSettings: {},
  domainEntry: null,
  domainMode: SHARED.DEFAULT_MODE,
  // v0.6.2: parent-domain inheritance hint. matchedKey is the key
  // resolveDomainKey() actually picked — which can be a parent of
  // state.hostname (e.g. "example.com" while visiting www.example.com).
  // We surface that to the user so the hint is honest, and so the
  // user understands that toggling here creates a per-site shadow
  // entry rather than flipping the parent's value.
  matchedKey: null,
  sessionActive: false,
  effectiveEnabled: true,
  effectiveMode: SHARED.DEFAULT_MODE,
  // v0.9.1 task 2.4: effective preset derived from the matched domain
  // entry's feature profile, or the canonical default-complete
  // snapshot when no entry exists. Session overrides enabled only;
  // the profile always comes from the matched domain or the default.
  effectivePreset: SHARED.PRESET_COMPLETE,
  enabledSource: 'global',
  syncAvailable: false,
  syncBytesInUse: 0,
  lastWriteFallback: false,
  theme: SHARED.DEFAULT_THEME
};

const elements = {
  toggleButton: document.getElementById('toggleButton'),
  statusText: document.getElementById('statusText'),
  domainText: document.getElementById('domainText'),
  domainHint: document.getElementById('domainHint'),
  domainToggle: document.getElementById('domainToggle'),
  exceptionAddButton: document.getElementById('exceptionAddButton'),
  quickLiteButton: document.getElementById('quickLiteButton'),
  quickSessionOffButton: document.getElementById('quickSessionOffButton'),
  quickPermanentOffButton: document.getElementById('quickPermanentOffButton'),
  quickRecoveryHint: document.getElementById('quickRecoveryHint'),
  modeLite: document.getElementById('modeLite'),
  modeUltimate: document.getElementById('modeUltimate'),
  modeHint: document.getElementById('modeHint'),
  presetSafe: document.getElementById('presetSafe'),
  presetComplete: document.getElementById('presetComplete'),
  presetUploadSafe: document.getElementById('presetUploadSafe'),
  presetHint: document.getElementById('presetHint'),
  effectiveSource: document.getElementById('effectiveSource'),
  featureImpactCard: document.getElementById('featureImpactCard'),
  featureImpactContent: document.getElementById('featureImpactContent'),
  themeDark: document.getElementById('themeDark'),
  themeNeon: document.getElementById('themeNeon'),
  themeLight: document.getElementById('themeLight'),
  themeHint: document.getElementById('themeHint'),
  sessionButton: document.getElementById('sessionButton'),
  sessionNotice: document.getElementById('sessionNotice'),
  syncUsage: document.getElementById('syncUsage'),
  copyDiagnosticButton: document.getElementById('copyDiagnosticButton'),
  showDiagnosticButton: document.getElementById('showDiagnosticButton'),
  diagnosticStatus: document.getElementById('diagnosticStatus'),
  diagnosticOutput: document.getElementById('diagnosticOutput'),
  ocrButton: document.getElementById('ocrButton'),
  openOptionsButton: document.getElementById('openOptionsButton'),
  openSidePanelButton: document.getElementById('openSidePanelButton'),
  mainWorldNotice: document.getElementById('mainWorldNotice')
};
// Fail fast if popup.html is out of sync with popup.js — a silent
// blank popup is harder to debug than a script error at startup.
for (const [name, el] of Object.entries(elements)) {
  if (!el) {
    throw new Error(`popup.js: missing required element #${name}`);
  }
}

// Pull the current tab's hostname. Returns '' for non-http pages
// (chrome://, about:blank, file://, extension pages), which the
// renderer treats as "domain controls unavailable".
async function getCurrentHostname() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) {
      return '';
    }
    return SHARED.getHostname(tab.url);
  } catch (_) {
    return '';
  }
}

// Pull all relevant state from chrome.storage. v0.4.0: read sync +
// local in parallel via resolveSettings (sync wins). Session read is
// gated on availability + hostname. Sync usage is also surfaced for
// the popup UI indicator.
async function loadState() {
  state.hostname = await getCurrentHostname();

  let merged;
  try {
    merged = await SHARED.resolveSettings(SHARED.STORAGE_DEFAULTS);
  } catch (_) {
    merged = { enabled: true, domainSettings: {}, theme: SHARED.DEFAULT_THEME };
  }
  state.globalEnabled = merged.enabled !== false;
  state.domainSettings = merged.domainSettings && typeof merged.domainSettings === 'object'
    ? merged.domainSettings
    : {};
  state.theme = SHARED.resolveTheme(merged.theme);
  applyTheme(state.theme);
  state.domainEntry = state.hostname && Object.prototype.hasOwnProperty.call(state.domainSettings, state.hostname)
    ? state.domainSettings[state.hostname]
    : null;
  // v0.6.2: resolve the actual governing key, which may be a parent
  // domain. Used both for the inheritance hint and to keep the
  // effective decision in lockstep with the content script.
  state.matchedKey = state.hostname
    ? SHARED.resolveDomainKey(state.hostname, state.domainSettings)
    : null;
  // v0.5.0: domainEntry is now a { enabled, mode } object (or
  // unmigrated boolean). Normalize to derive domainMode for UI
  // display; the content script also normalizes defensively.
  state.domainMode = state.hostname
    ? (SHARED.resolveMode(state.hostname, state.domainSettings) || SHARED.DEFAULT_MODE)
    : SHARED.DEFAULT_MODE;

  state.sessionAvailable = SHARED.isSessionStorageAvailable();
  state.sessionActive = false;
  if (state.hostname && state.sessionAvailable) {
    const sessionKey = SHARED.sessionKeyFor(state.hostname);
    try {
      const sessionData = await SHARED.storageGet(chrome.storage.session, sessionKey);
      state.sessionActive = sessionData[sessionKey] === true;
      state.sessionPaused = sessionData[sessionKey] === false;
    } catch (_) {
      state.sessionActive = false;
      state.sessionPaused = false;
    }
  } else {
    state.sessionPaused = false;
  }

  state.effectiveEnabled = (state.sessionActive || state.sessionPaused)
    ? state.sessionActive
    : SHARED.isDomainEnabled(state.globalEnabled, state.domainSettings, state.hostname);
  // Session always implies ultimate. Otherwise inherit domain mode
  // (or default when no entry).
  state.effectiveMode = state.sessionActive
    ? SHARED.MODE_ULTIMATE
    : state.domainMode;

  // v0.9.1 task 2.4: derive effective preset and enabled source.
  const presetState = computePresetState(state, SHARED);
  state.effectivePreset = presetState.displayPreset;
  state.enabledSource = presetState.source;

  // Sync usage probe — best effort. syncAvailable is set true when
  // getBytesInUse returns a non-zero value; a successful write is
  // the alternate signal (used by the toggle handlers' fallback).
  // We do NOT write {} to sync purely as a probe — that would burn
  // part of the per-minute write quota.
  try {
    const bytes = await SHARED.getBytesInUse(chrome.storage.sync);
    state.syncBytesInUse = bytes;
    state.syncAvailable = bytes > 0;
  } catch (_) {
    state.syncAvailable = false;
  }
}

// Mirrors content.js resolution rules so the popup's button labels
// match what the content script will actually do.
function domainDecisionIgnoringSession() {
  return SHARED.isDomainEnabled(state.globalEnabled, state.domainSettings, state.hostname);
}

function render() {
  // ---- Global toggle (existing v0.2.0 block) ----
  elements.toggleButton.textContent = state.globalEnabled ? 'ON' : 'OFF';
  elements.toggleButton.classList.toggle('is-off', !state.globalEnabled);
  elements.toggleButton.setAttribute('aria-pressed', String(state.globalEnabled));
  elements.statusText.textContent = state.globalEnabled
    ? '전역 차단 완화 활성화'
    : '전역 차단 완화 비활성화';

  // ---- Theme (UI-only, applied at document level via CSS variables) ----
  applyTheme(state.theme);
  syncThemeButtons();

  // ---- Domain toggle ----
  if (!state.hostname) {
    elements.domainText.textContent = '이 페이지에서는 도메인 설정 불가';
    elements.domainText.classList.add('is-unavailable');
    elements.domainHint.textContent = 'http(s) 페이지를 방문하면 도메인별 설정이 표시됩니다.';
    if (elements.quickRecoveryHint) {
      elements.quickRecoveryHint.textContent = 'http(s) 페이지를 방문하면 빠른 복구 옵션이 표시됩니다.';
    }
    if (elements.quickLiteButton) elements.quickLiteButton.disabled = true;
    if (elements.quickSessionOffButton) elements.quickSessionOffButton.disabled = true;
    if (elements.featureImpactCard) elements.featureImpactCard.classList.add('is-hidden');
    elements.domainToggle.disabled = true;
    elements.domainToggle.textContent = '—';
    elements.domainToggle.classList.remove('is-off');
    if (elements.exceptionAddButton) {
      elements.exceptionAddButton.classList.add('is-hidden');
      elements.exceptionAddButton.disabled = true;
    }
    elements.sessionButton.disabled = true;
    elements.modeLite.disabled = true;
    elements.modeUltimate.disabled = true;
    elements.modeHint.textContent = '도메인 설정 가능 시 모드를 선택할 수 있습니다.';
    elements.presetSafe.disabled = true;
    elements.presetComplete.disabled = true;
    elements.presetUploadSafe.disabled = true;
    elements.presetHint.textContent = '도메인 설정 가능 시 호환성 프리셋을 선택할 수 있습니다.';
    elements.effectiveSource.textContent = '';
    return;
  }

  elements.domainText.textContent = state.hostname;
  elements.domainText.classList.remove('is-unavailable');

  const domainDecision = domainDecisionIgnoringSession();
  elements.domainToggle.disabled = false;
  elements.domainToggle.textContent = domainDecision ? 'ON' : 'OFF';
  elements.domainToggle.classList.toggle('is-off', !domainDecision);
  elements.domainToggle.setAttribute('aria-pressed', String(domainDecision));

  if (elements.exceptionAddButton) {
    elements.exceptionAddButton.classList.remove('is-hidden');
    elements.exceptionAddButton.disabled = false;
  }

  if (state.sessionActive) {
    elements.domainHint.textContent = '세션 모드 활성 — 페이지 새로고침 후 도메인 설정 적용';
    elements.domainHint.classList.add('is-domain-off');
  } else if (state.matchedKey && state.matchedKey !== state.hostname) {
    // Parent-domain inheritance — the entry that governs this tab is
    // stored under a parent key (e.g. example.com while visiting
    // www.example.com). The user's own hostname has no entry, so
    // toggling or changing mode here will create a per-hostname
    // shadow entry rather than flipping the parent (which would
    // affect sibling subdomains).
    const parentEntry = SHARED.parseDomainSetting(state.domainSettings[state.matchedKey]);
    const parentOff = parentEntry.enabled === false;
    elements.domainHint.textContent = `상위 도메인(${state.matchedKey}) 설정 ${parentOff ? 'OFF' : 'ON'} 상속 중 — 토글/모드 선택 시 ${state.hostname} 전용 설정이 생성됩니다`;
    elements.domainHint.classList.toggle('is-domain-off', parentOff);
  } else if (state.domainEntry === null) {
    elements.domainHint.textContent = `기본값 따름 (${state.globalEnabled ? '전역 ON' : '전역 OFF'})`;
    elements.domainHint.classList.remove('is-domain-off');
  } else {
    const parsedEntry = SHARED.parseDomainSetting(state.domainEntry);
    const entryOff = parsedEntry.enabled === false;
    elements.domainHint.textContent = `이 사이트에서 ${entryOff ? '항상 OFF' : '항상 ON'}`;
    elements.domainHint.classList.toggle('is-domain-off', entryOff);
  }

  // ---- Mode toggle (v0.5.0) ----
  // Buttons reflect the effective mode. Clicking a mode button
  // writes a domainSettings entry for this hostname; if no entry
  // exists yet, one is created with enabled=true and the chosen
  // mode. The buttons stay enabled even without an existing entry
  // so the user can opt into a per-hostname mode in one click.
  const hasDomainEntry = state.domainEntry !== null;
  elements.modeLite.disabled = state.sessionActive;
  elements.modeUltimate.disabled = state.sessionActive;
  const activeMode = state.effectiveMode;
  elements.modeLite.classList.toggle('is-active', activeMode === SHARED.MODE_LITE);
  elements.modeUltimate.classList.toggle('is-active', activeMode === SHARED.MODE_ULTIMATE);
  elements.modeLite.setAttribute('aria-checked', String(activeMode === SHARED.MODE_LITE));
  elements.modeUltimate.setAttribute('aria-checked', String(activeMode === SHARED.MODE_ULTIMATE));
  elements.modeLite.setAttribute('tabindex', String(activeMode === SHARED.MODE_LITE ? 0 : -1));
  elements.modeUltimate.setAttribute('tabindex', String(activeMode === SHARED.MODE_ULTIMATE ? 0 : -1));
  if (state.sessionActive) {
    elements.modeHint.textContent = '세션 활성 중 — 잠시 후 새로고침되며 Ultimate로 동작합니다.';
  } else if (!hasDomainEntry) {
    elements.modeHint.textContent = 'Ultimate(기본): 블록 지정 활성화 (CSS 드래그 강제 허용). Lite: JS 차단만 완화. 도메인 ON 후 모드를 선택하세요.';
  } else {
    elements.modeHint.textContent = activeMode === SHARED.MODE_LITE
      ? 'Lite — JS 차단만 완화 (사이트 UI 보존, CSS 주입 없음)'
      : 'Ultimate — 블록 지정 활성화 (CSS 드래그 강제 허용 + 완전 복사)';
  }

  // ---- Preset toggle (v0.9.1 task 2.4) ----
  // The preset radiogroup shows the effective compatibility profile
  // derived from the matched domain entry (parent or exact) or the
  // default-complete snapshot. Session overrides enabled only; the
  // profile continues to govern the tab, so preset controls stay
  // enabled during session. For options-only presets (selection,
  // media-safe, custom) no radio button is highlighted — the popup
  // shows an honest "advanced/custom" hint instead of falsely
  // highlighting Complete.
  const presetState = computePresetState(state, SHARED);
  const presetButtons = [
    { el: elements.presetSafe, id: SHARED.PRESET_SAFE },
    { el: elements.presetComplete, id: SHARED.PRESET_COMPLETE },
    { el: elements.presetUploadSafe, id: SHARED.PRESET_UPLOAD_SAFE }
  ];
  for (const { el, id } of presetButtons) {
    const isActive = presetState.isPopupPreset && presetState.displayPreset === id;
    el.disabled = !presetState.canSelect;
    el.classList.toggle('is-active', isActive);
    el.setAttribute('aria-checked', String(isActive));
    el.setAttribute('tabindex', String(
      computePresetTabindex(id, isActive, presetState.isPopupPreset, presetState.canSelect, SHARED)
    ));
  }
  if (!presetState.isPopupPreset) {
    const advancedLabel = advancedPresetLabelKorean(presetState.displayPreset);
    elements.presetHint.textContent = `현재 프로필: ${advancedLabel} — 옵션 페이지에서 변경 가능합니다. 팝업에서 안전/완전/업로드 보호 중 하나를 선택하면 이 사이트 전용 설정으로 전환됩니다.`;
  } else if (state.sessionActive) {
    elements.presetHint.textContent = '세션 활성 중 — 활성화만 세션이 덮어쓰며 프로필은 도메인(또는 기본 완전)을 따릅니다. 프로필 선택은 즉시 도메인에 저장됩니다.';
  } else if (!presetState.hasMatchedEntry) {
    elements.presetHint.textContent = '완전(기본): 모든 차단 해제. 안전: 드래그/드롭·오버레이 제거 최소화. 업로드 보호: 드롭존 보존. 도메인 ON 후 프리셋을 선택하세요.' +
      computePresetSafetySuffix(SHARED.PRESET_COMPLETE, SHARED);
  } else {
    elements.presetHint.textContent = presetState.displayPreset === SHARED.PRESET_SAFE
      ? '안전 — 드래그/드롭·오버레이 제거 최소화 (사이트 호환성 우선)'
      : presetState.displayPreset === SHARED.PRESET_UPLOAD_SAFE
        ? '업로드 보호 — 드롭존 보존 (업로드 사이트 호환성)'
        : '완전 — 모든 차단 해제 (기본)' + computePresetSafetySuffix(presetState.displayPreset, SHARED);
  }
  elements.effectiveSource.textContent = computeEffectiveSourceText(
    presetState.source, presetState.displayPreset, presetState.isPopupPreset, presetState.hasMatchedEntry, SHARED
  );

  // ---- Quick recovery UI (v0.10.2 task 4) ----
  renderQuickRecovery();
  if (state.hostname) {
    renderFeatureImpact(state.features, state.effectiveMode, presetState);
  } else if (elements.featureImpactCard) {
    elements.featureImpactCard.classList.add('is-hidden');
  }

  // ---- Session button ----
  elements.sessionButton.disabled = !state.sessionAvailable;
  elements.sessionButton.classList.toggle('is-active', state.sessionActive);
  elements.sessionButton.setAttribute('aria-pressed', String(state.sessionActive));
  elements.sessionButton.textContent = state.sessionActive
    ? '세션 활성화 중 — 클릭하여 끄기'
    : '이번 세션만 임시 활성화';

  // ---- Session availability notice (v0.6.0) ----
  // Firefox MV3 does not yet implement chrome.storage.session. When
  // the API is missing we show a friendly explanation rather than a
  // silently disabled button so the user knows this is a platform
  // gap, not a bug.
  if (elements.sessionNotice) {
    if (!state.sessionAvailable) {
      elements.sessionNotice.textContent = '현재 브라우저는 chrome.storage.session을 지원하지 않아 세션 임시 활성화 기능을 사용할 수 없습니다. 영구 도메인 설정은 계속 사용할 수 있습니다.';
      elements.sessionNotice.classList.remove('is-hidden');
    } else {
      elements.sessionNotice.textContent = '';
      elements.sessionNotice.classList.add('is-hidden');
    }
  }

  // ---- Side panel shortcut (v0.6.0) ----
  if (elements.openSidePanelButton) {
    const supportsSidePanel = typeof chrome !== 'undefined' && chrome.sidePanel && typeof chrome.sidePanel.open === 'function';
    if (supportsSidePanel) {
      elements.openSidePanelButton.classList.remove('is-hidden');
    } else {
      elements.openSidePanelButton.classList.add('is-hidden');
    }
  }

  // ---- Sync usage indicator ----
  if (elements.syncUsage) {
    if (state.syncAvailable) {
      const total = (SHARED.SYNC_QUOTA && SHARED.SYNC_QUOTA.BYTES_TOTAL) || 1;
      const kb = Math.round(state.syncBytesInUse / 1024);
      const limitKb = Math.round(total / 1024);
      const pct = Math.round((state.syncBytesInUse / total) * 100);
      const safePct = Number.isFinite(pct) ? pct : 0;
      elements.syncUsage.textContent = `동기화 사용량: ${kb}KB / ${limitKb}KB (${safePct}%)`;
      elements.syncUsage.classList.toggle('is-warn', safePct >= 80);
      elements.syncUsage.classList.remove('is-hidden');
    } else if (state.lastWriteFallback) {
      elements.syncUsage.textContent = '동기화 사용 불가 — 현재 기기에만 저장됨';
      elements.syncUsage.classList.add('is-warn');
      elements.syncUsage.classList.remove('is-hidden');
    } else {
      elements.syncUsage.textContent = '';
      elements.syncUsage.classList.add('is-hidden');
    }
  }

  // ---- OCR button visibility (v0.8.0) ----
  const supportsOffscreen = typeof chrome !== 'undefined' && typeof chrome.offscreen !== 'undefined';
  elements.ocrButton.style.display = supportsOffscreen ? 'flex' : 'none';

  // ---- MAIN-world reload notice (v0.9.0, task 2.3) ----
  // MAIN-world prototype patches run unconditionally at document_start
  // and cannot be removed mid-page-life. When the user toggles OFF or
  // switches to a profile that does not want MAIN-level unblocking,
  // the ISOLATED-world teardown is immediate but the MAIN patches
  // persist for the current page lifetime and are installed again on
  // reload while the extension remains enabled. This notice
  // communicates that limitation honestly and never promises immediate
  // full restoration or reload-alone unpatching.
  renderMainWorldNotice();
}

function renderMainWorldNotice() {
  const notice = elements.mainWorldNotice;
  if (!notice) return;

  const result = computeMainWorldNotice(state, SHARED.MODE_LITE);
  notice.textContent = result.text;
  if (result.visible) {
    notice.classList.remove('is-hidden');
  } else {
    notice.classList.add('is-hidden');
  }
}

const RECOVERY_FEATURE_ROWS = [
  { key: 'contextMenu',   label: '우클릭 메뉴 복원' },
  { key: 'selection',     label: '텍스트 선택 허용' },
  { key: 'copyShortcuts', label: '복사/잘라내기(Ctrl+C/X)' },
  { key: 'dragStart',    label: '드래그 시작 허용' },
  { key: 'dragDrop',     label: '드래그 오버/드롭 허용' },
  { key: 'overlayCleanup', label: '오버레이 제거' },
  { key: 'printUnhide',  label: '인쇄 시 숨김 복원' },
  { key: 'shadowDom',    label: '닫힌 Shadow DOM 허용' },
  { key: 'ultimateCss',  label: 'CSS 블록 지정 강제 허용' }
];

function computeFeatureImpact(features, mode, presetState) {
  const isLite = mode === SHARED.MODE_LITE;
  const isSafe = presetState.displayPreset === SHARED.PRESET_SAFE;
  const isUploadSafe = presetState.displayPreset === SHARED.PRESET_UPLOAD_SAFE;
  const rows = [];
  for (const { key, label } of RECOVERY_FEATURE_ROWS) {
    let active = false;
    if (key === 'ultimateCss') {
      active = !isLite && Boolean(features);
    } else if (key === 'dragStart' || key === 'dragDrop') {
      active = (isSafe || isUploadSafe) ? false : Boolean(features && features[key]);
    } else if (key === 'overlayCleanup') {
      active = isSafe ? false : Boolean(features && features[key]);
    } else if (key === 'shadowDom' || key === 'printUnhide') {
      active = isSafe ? false : Boolean(features && features[key]);
    } else {
      active = Boolean(features && features[key]);
    }
    rows.push({ label, active });
  }
  return rows;
}

function renderFeatureImpact(features, mode, presetState) {
  const card = elements.featureImpactCard;
  const content = elements.featureImpactContent;
  if (!card || !content) return;

  const rows = computeFeatureImpact(features, mode, presetState);
  content.innerHTML = '';
  for (const { label, active } of rows) {
    const row = document.createElement('div');
    row.className = 'feature-impact-row' + (active ? ' is-active' : '');
    row.innerHTML = `<span class="feature-impact-icon"></span><span class="feature-impact-label">${label}</span><span class="feature-impact-badge">${active ? 'ON' : 'OFF'}</span>`;
    content.appendChild(row);
  }
  card.classList.remove('is-hidden');
}

function renderQuickRecovery() {
  const liteBtn = elements.quickLiteButton;
  const pauseBtn = elements.quickSessionOffButton;
  const offBtn = elements.quickPermanentOffButton;
  const hint = elements.quickRecoveryHint;
  if (!liteBtn || !pauseBtn || !offBtn || !hint) return;

  const canSession = state.sessionAvailable;

  if (!state.hostname) {
    hint.textContent = 'http(s) 페이지를 방문하면 빠른 복구 옵션이 표시됩니다.';
    liteBtn.disabled = true;
    pauseBtn.disabled = true;
    offBtn.disabled = true;
    pauseBtn.classList.remove('is-paused');
    pauseBtn.querySelector('.recovery-button-label').textContent = '이번 세션만 일시정지';
    pauseBtn.querySelector('.recovery-button-desc').textContent = '확장 온 · 이 사이트만 잠시 끄기';
    return;
  }

  if (state.sessionActive) {
    liteBtn.disabled = true;
    pauseBtn.disabled = true;
    offBtn.disabled = true;
    hint.textContent = '세션 활성 중 — Lite 전환은 새로고침 후 적용됩니다.';
    pauseBtn.classList.remove('is-paused');
    pauseBtn.querySelector('.recovery-button-label').textContent = '이번 세션만 일시정지';
    pauseBtn.querySelector('.recovery-button-desc').textContent = '확장 온 · 이 사이트만 잠시 끄기';
    return;
  }

  liteBtn.disabled = false;

  if (state.sessionPaused) {
    pauseBtn.disabled = false;
    pauseBtn.classList.add('is-paused');
    pauseBtn.querySelector('.recovery-button-label').textContent = '일시정지됨 — 클릭하여 복원';
    pauseBtn.querySelector('.recovery-button-desc').textContent = '세션 OFF 복원 · 확장 다시 허용';
    offBtn.disabled = false;
    hint.textContent = '이 사이트 일시정지됨 — 복원하면 확장 우회 재활성화';
    return;
  }

  if (!canSession) {
    pauseBtn.disabled = true;
    pauseBtn.classList.remove('is-paused');
    pauseBtn.querySelector('.recovery-button-label').textContent = '이번 세션만 일시정지';
    pauseBtn.querySelector('.recovery-button-desc').textContent = '세션 사용 불가';
    offBtn.disabled = false;
    hint.textContent = '세션 일시정지 불가 — 영구 OFF를 사용하세요.';
    return;
  }

  pauseBtn.disabled = false;
  pauseBtn.classList.remove('is-paused');
  pauseBtn.querySelector('.recovery-button-label').textContent = '이번 세션만 일시정지';
  pauseBtn.querySelector('.recovery-button-desc').textContent = '확장 온 · 이 사이트만 잠시 끄기';
  offBtn.disabled = false;
  hint.textContent = '확장 전체를 끄지 않고 이 사이트만 설정을 조정합니다.';
}

function computePresetSafetySuffix(displayPreset, sharedModule) {
  return displayPreset === sharedModule.PRESET_COMPLETE
    ? ' 이 사이트가 깨지면 안전 프리셋 또는 Lite 모드로 낮춰 보세요.'
    : '';
}

function computeMainWorldNotice(state, modeLite) {
  if (!state.hostname) {
    return { text: '', visible: false };
  }
  if (!state.effectiveEnabled) {
    return {
      text: 'ISOLATED 차단 해제(CSS, 캡처 차단)는 즉시 꺼집니다. MAIN-world 프로토타입 패치는 확장이 켜져 있는 한 새로고침해도 다시 적용됩니다. 완전한 차단 복원은 확장을 비활성화하고 탭을 새로고침해야 합니다.',
      visible: true
    };
  }
  if (state.effectiveMode === modeLite) {
    return {
      text: 'Lite 모드 전환은 ISOLATED 기능(CSS, 캡처 차단)에 즉시 적용됩니다. MAIN-world 프로토타입 패치는 확장이 켜져 있는 한 새로고침해도 유지됩니다.',
      visible: true
    };
  }
  return { text: '', visible: false };
}

// ---- v0.9.1 task 2.4: preset pure helpers ----
// These functions are extracted as pure helpers so they can be unit
// tested via the VM harness without a DOM. They take a plain state
// object and the SHARED module, and return plain data — no side
// effects, no DOM access, no chrome.* calls.

// Classifies a parsed preset id for popup display. Returns:
//   { displayPreset, isPopupPreset }
// displayPreset is one of the three popup-selectable ids when the
// parsed preset is one of them. For options-only presets
// (selection, media-safe, custom) displayPreset is null and
// isPopupPreset is false — the popup must NOT highlight any of the
// three radio buttons in that case, and must show an honest
// "advanced/custom" hint instead.
function classifyPreset(parsedPreset, SHARED) {
  if (
    parsedPreset === SHARED.PRESET_SAFE
    || parsedPreset === SHARED.PRESET_COMPLETE
    || parsedPreset === SHARED.PRESET_UPLOAD_SAFE
  ) {
    return { displayPreset: parsedPreset, isPopupPreset: true };
  }
  return { displayPreset: null, isPopupPreset: false };
}

// Computes the effective preset state for the popup view. Profile
// derivation uses state.matchedKey (which may be a parent domain)
// and state.domainSettings[matchedKey] — NOT state.domainEntry
// (which is exact-host only). This keeps the popup's displayed
// profile in lockstep with the content script, which resolves the
// same matched key. Source precedence: session > domain > global.
// Session overrides enabled only; the profile always comes from the
// matched domain entry or the canonical default-complete.
// canSelect is always true when a hostname exists — session does NOT
// disable preset editing because the profile continues to govern
// the tab regardless of the session enabled-override.
function computePresetState(state, SHARED) {
  if (!state.hostname) {
    return {
      displayPreset: SHARED.PRESET_COMPLETE,
      isPopupPreset: true,
      source: 'global',
      hasMatchedEntry: false,
      matchedKey: null,
      canSelect: false
    };
  }

  const matchedKey = state.matchedKey || null;
  const matchedEntry = matchedKey && state.domainSettings
    ? state.domainSettings[matchedKey]
    : null;
  const hasMatchedEntry = matchedEntry !== null && matchedEntry !== undefined;

  const source = state.sessionActive
    ? 'session'
    : hasMatchedEntry
      ? 'domain'
      : 'global';

  let displayPreset = SHARED.PRESET_COMPLETE;
  let isPopupPreset = true;
  if (hasMatchedEntry) {
    const parsed = SHARED.parseDomainSetting(matchedEntry);
    const classified = classifyPreset(parsed.preset, SHARED);
    displayPreset = classified.displayPreset;
    isPopupPreset = classified.isPopupPreset;
    if (!isPopupPreset) {
      displayPreset = parsed.preset;
    }
  }

  return {
    displayPreset,
    isPopupPreset,
    source,
    hasMatchedEntry,
    matchedKey,
    canSelect: true
  };
}

// Computes the domain entry to write when the user selects a preset.
// The entry is a full canonical normalized snapshot: { enabled, mode,
// preset, features }. We run the result through parseDomainSetting
// to derive the canonical features map from PRESET_FEATURES, so the
// stored entry contains all 9 feature booleans. If no domain entry
// exists, creates one with enabled=true and default mode. If an
// entry exists, preserves its enabled flag and mode.
function computePresetEntry(currentDomainEntry, presetId, SHARED) {
  const parsed = SHARED.parseDomainSetting(currentDomainEntry);
  const enabled = currentDomainEntry === null ? true : parsed.enabled;
  const mode = currentDomainEntry === null ? SHARED.DEFAULT_MODE : parsed.mode;
  const raw = { enabled, mode, preset: presetId };
  const normalized = SHARED.parseDomainSetting(raw);
  return { enabled: normalized.enabled, mode: normalized.mode, preset: normalized.preset, features: normalized.features };
}

// Computes the domain entry to write when the user toggles enabled
// or selects a mode. Preserves the existing preset and features from
// the matched entry (parent or exact) so the profile is NOT silently
// reset. If creating a new exact-host shadow from inherited parent
// state, preserves the parent's preset and features.
function computeProfilePreservingEntry(currentDomainEntry, overrides, SHARED) {
  const parsed = SHARED.parseDomainSetting(currentDomainEntry);
  const enabled = Object.prototype.hasOwnProperty.call(overrides, 'enabled')
    ? overrides.enabled
    : (currentDomainEntry === null ? true : parsed.enabled);
  const mode = Object.prototype.hasOwnProperty.call(overrides, 'mode')
    ? overrides.mode
    : (currentDomainEntry === null ? SHARED.DEFAULT_MODE : parsed.mode);
  const raw = { enabled, mode, preset: parsed.preset, features: parsed.features };
  const normalized = SHARED.parseDomainSetting(raw);
  return { enabled: normalized.enabled, mode: normalized.mode, preset: normalized.preset, features: normalized.features };
}

// Renders the effective-source line text. Session active means the
// profile still comes from the matched domain (or default complete),
// but enabled is overridden by the session — the wording must make
// that distinction clear so the user does not think the preset
// selection is in effect.
function computeEffectiveSourceText(source, displayPreset, isPopupPreset, hasMatchedEntry, SHARED) {
  const presetLabel = isPopupPreset
    ? presetLabelKorean(displayPreset)
    : advancedPresetLabelKorean(displayPreset);
  if (source === 'session') {
    const profileOrigin = hasMatchedEntry ? '도메인 설정' : '기본값';
    return `활성 출처: 세션(활성화만) · 프로필: ${profileOrigin} (${presetLabel})`;
  }
  if (source === 'domain') {
    return `활성 출처: 도메인 · 프로필: ${presetLabel}`;
  }
  return `활성 출처: 전역(기본) · 프로필: ${presetLabel}`;
}

function presetLabelKorean(presetId) {
  switch (presetId) {
    case 'safe': return '안전';
    case 'complete': return '완전';
    case 'upload-safe': return '업로드 보호';
    default: return '완전';
  }
}

function advancedPresetLabelKorean(presetId) {
  switch (presetId) {
    case 'selection': return '선택 (고급)';
    case 'media-safe': return '미디어 보호 (고급)';
    case 'custom': return '사용자 정의 (고급)';
    default: return '고급';
  }
}

// Computes the tabindex value for a preset button. The active popup
// preset gets tabindex=0 (roving tabindex focus anchor). When no
// popup preset is active (options-only profile), the Complete button
// gets tabindex=0 as a focus anchor so the radiogroup remains
// Tab-reachable — aria-checked stays false and .is-active is not set.
// Disabled buttons always get tabindex=-1.
function computePresetTabindex(buttonId, isActive, isPopupPreset, canSelect, SHARED) {
  if (!canSelect) return -1;
  if (isActive) return 0;
  if (!isPopupPreset && buttonId === SHARED.PRESET_COMPLETE) return 0;
  return -1;
}

// Resolves the preset id to start keyboard navigation from. Priority:
// 1. The radio that actually received the keydown (currentTarget) —
//    a pointer-clicked or programmatically focused tabindex=-1 radio
//    can receive keydown before the async render cycle updates tabindex.
// 2. The button with tabindex=0 (the roving-tabindex focus anchor).
// 3. The button with .is-active (the aria-checked radio).
// 4. PRESET_COMPLETE (the default/center fallback).
// Each entry in buttons is { el, id }. The focusedEl is event.currentTarget.
function resolveCurrentPreset(focusedEl, buttons, KB) {
  if (focusedEl) {
    const focused = buttons.find(({ el }) => el === focusedEl);
    if (focused) return focused.id;
  }
  const anchor = buttons.find(({ el }) => el.getAttribute('tabindex') === '0');
  if (anchor) return anchor.id;
  const active = buttons.find(({ el }) => el.classList.contains('is-active'));
  if (active) return active.id;
  return KB.PRESET_COMPLETE;
}

// ---- v0.9.1 task 2.6: privacy-safe local diagnostic report ----
// The DOM bridge is shared with the page, so treat every value read from it
// as untrusted. The serializer creates new allowlisted objects only; it never
// spreads or stringifies the bridge object itself.
const DIAGNOSTIC_ATTRIBUTE_COUNTER_KEYS = Object.freeze([
  'oncontextmenu', 'onselectstart', 'oncopy', 'oncut', 'onpaste',
  'ondragstart', 'ondragover', 'ondrop'
]);
const DIAGNOSTIC_EVENT_COUNTER_KEYS = Object.freeze([
  'contextmenu', 'selectstart', 'copy', 'cut', 'paste', 'dragstart',
  'dragover', 'drop', 'mousedown', 'mouseup', 'keydown'
]);
const DIAGNOSTIC_SOURCES = Object.freeze(['initial', 'session', 'domain', 'global']);
const DIAGNOSTIC_HOSTNAME_PATTERN = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i;

function readShortcutAssignment(chromeApi) {
  if (!chromeApi.commands || typeof chromeApi.commands.getAll !== 'function') {
    return Promise.resolve('unavailable');
  }
  return chromeApi.commands.getAll()
    .then((commands) => {
      const command = Array.isArray(commands) && commands.find((item) => item && item.name === 'trigger-ocr');
      return command && typeof command.shortcut === 'string' && command.shortcut.length > 0
        ? 'assigned'
        : 'unassigned';
    })
    .catch(() => 'unavailable');
}

function resolveDiagnosticCapabilities(chromeApi) {
  return {
    localOcr: Boolean(chromeApi && chromeApi.offscreen),
    ocrEngineReady: Boolean(chromeApi && chromeApi.offscreen)
  };
}

function isSafeDiagnosticHostname(value) {
  return typeof value === 'string'
    && value.length > 0
    && DIAGNOSTIC_HOSTNAME_PATTERN.test(value)
    && !value.includes('..');
}

async function requestDiagnosticBridge(chromeApi) {
  try {
    const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
    if (!tab || typeof tab.id !== 'number') {
      return { ok: false, reason: '현재 탭을 확인할 수 없습니다. 페이지를 새로고침한 뒤 다시 시도하세요.' };
    }
    const response = await chromeApi.tabs.sendMessage(tab.id, { type: 'rcow:readDiagnosticStats' });
    if (!response || response.ok !== true || !response.stats || typeof response.stats !== 'object' || Array.isArray(response.stats)) {
      return {
        ok: false,
        reason: response && typeof response.reason === 'string'
          ? response.reason
          : '현재 탭에서 진단 브리지를 찾을 수 없습니다. 페이지를 새로고침한 뒤 다시 시도하세요.'
      };
    }
    return { ok: true, stats: response.stats };
  } catch (_) {
    return { ok: false, reason: '현재 탭에서 진단 브리지를 찾을 수 없습니다. 페이지를 새로고침한 뒤 다시 시도하세요.' };
  }
}

function copyAllowedCounters(source, keys) {
  const result = {};
  for (const key of keys) {
    let value;
    try {
      value = source && typeof source === 'object' ? source[key] : undefined;
    } catch (_) {
      value = undefined;
    }
    result[key] = Number.isInteger(value) && value >= 0 ? value : 0;
  }
  return result;
}

function copySafeFeatureMap(stats, SHARED) {
  let featureMap = {};
  try {
    featureMap = stats && stats.features && typeof stats.features === 'object'
      ? stats.features
      : {};
  } catch (_) {
    featureMap = {};
  }
  const enabledFeatures = [];
  for (const key of SHARED.FEATURE_KEYS) {
    try {
      if (featureMap[key] === true) {
        enabledFeatures.push(key);
      }
    } catch (_) {}
  }
  return enabledFeatures;
}

function readDiagnosticValue(source, key) {
  try {
    return source && typeof source === 'object' ? source[key] : undefined;
  } catch (_) {
    return undefined;
  }
}

function serializeDiagnosticReport(input, SHARED) {
  const stats = input && input.stats && typeof input.stats === 'object' ? input.stats : {};
  const safeHostname = isSafeDiagnosticHostname(input && input.hostname) ? input.hostname : null;
  const safeMatchedDomain = isSafeDiagnosticHostname(input && input.matchedDomain)
    ? input.matchedDomain
    : null;
  const enabledFeatures = copySafeFeatureMap(stats, SHARED);
  let resolveSource = null;
  let modeValue = null;
  let presetValue = null;
  resolveSource = readDiagnosticValue(stats, 'resolveSource');
  modeValue = readDiagnosticValue(stats, 'mode');
  presetValue = readDiagnosticValue(stats, 'preset');
  const source = DIAGNOSTIC_SOURCES.includes(resolveSource) ? resolveSource : 'unknown';
  const mode = modeValue === SHARED.MODE_LITE || modeValue === SHARED.MODE_ULTIMATE
    ? modeValue
    : 'unknown';
  const presetIds = [
    SHARED.PRESET_SAFE,
    SHARED.PRESET_SELECTION,
    SHARED.PRESET_COMPLETE,
    SHARED.PRESET_UPLOAD_SAFE,
    SHARED.PRESET_MEDIA_SAFE,
    SHARED.PRESET_CUSTOM
  ];
  const preset = presetIds.includes(presetValue) ? presetValue : 'unknown';

  return {
    version: typeof input.version === 'string' ? input.version : 'unknown',
    hostname: safeHostname,
    resolutionSource: source,
    matchedDomain: safeMatchedDomain,
    mode,
    preset,
    enabledFeatures,
    capabilities: {
      localOcr: Boolean(input && input.capabilities && input.capabilities.localOcr === true),
      ocrEngineReady: Boolean(input && input.capabilities && input.capabilities.ocrEngineReady === true),
      shortcutAssignment: ['assigned', 'unassigned', 'unavailable'].includes(input && input.shortcutAssignment)
        ? input.shortcutAssignment
        : 'unavailable'
    },
    counters: {
      attributeRemovals: copyAllowedCounters(readDiagnosticValue(stats, 'attributeRemovals'), DIAGNOSTIC_ATTRIBUTE_COUNTER_KEYS),
      eventInterceptions: copyAllowedCounters(readDiagnosticValue(stats, 'eventInterceptions'), DIAGNOSTIC_EVENT_COUNTER_KEYS),
      overlaysNeutralized: copyAllowedCounters({ overlaysNeutralized: readDiagnosticValue(stats, 'overlaysNeutralized') }, ['overlaysNeutralized']).overlaysNeutralized,
      shadowRootsScanned: copyAllowedCounters({ shadowRootsScanned: readDiagnosticValue(stats, 'shadowRootsScanned') }, ['shadowRootsScanned']).shadowRootsScanned,
      periodicRescans: copyAllowedCounters({ periodicRescans: readDiagnosticValue(stats, 'periodicRescans') }, ['periodicRescans']).periodicRescans
    }
  };
}

async function buildDiagnosticReport({ chromeApi, version, hostname, matchedDomain, SHARED }) {
  const bridge = await requestDiagnosticBridge(chromeApi);
  if (!bridge.ok) {
    return bridge;
  }
  try {
    const report = serializeDiagnosticReport({
      version,
      hostname,
      matchedDomain,
      stats: bridge.stats,
      capabilities: resolveDiagnosticCapabilities(chromeApi),
      shortcutAssignment: await readShortcutAssignment(chromeApi)
    }, SHARED);
    return { ok: true, report };
  } catch (_) {
    return { ok: false, reason: '진단 보고서를 안전하게 생성하지 못했습니다. 현재 페이지를 새로고침한 뒤 다시 시도하세요.' };
  }
}

function showDiagnosticStatus(text, kind) {
  elements.diagnosticStatus.textContent = text;
  elements.diagnosticStatus.classList.remove('is-hidden', 'is-error', 'is-success');
  elements.diagnosticStatus.classList.add(kind === 'success' ? 'is-success' : 'is-error');
}

async function copyDiagnosticReport({ chromeApi, clipboard, version, hostname, matchedDomain, SHARED, onStatus }) {
  const result = await buildDiagnosticReport({ chromeApi, version, hostname, matchedDomain, SHARED });
  if (!result.ok) {
    onStatus(result.reason, 'error');
    return false;
  }
  try {
    await clipboard.writeText(JSON.stringify(result.report, null, 2));
    onStatus('개인정보를 제외한 로컬 진단 보고서를 클립보드에 복사했습니다.', 'success');
    return true;
  } catch (_) {
    onStatus('진단 보고서를 클립보드에 복사하지 못했습니다. 브라우저의 클립보드 권한을 확인한 뒤 다시 시도하세요.', 'error');
    return false;
  }
}

async function showDiagnosticReport({ chromeApi, version, hostname, matchedDomain, SHARED, output, onStatus }) {
  const result = await buildDiagnosticReport({ chromeApi, version, hostname, matchedDomain, SHARED });
  if (!result.ok) {
    onStatus(result.reason, 'error');
    return false;
  }
  output.textContent = JSON.stringify(result.report, null, 2);
  output.classList.remove('is-hidden');
  onStatus('현재 사이트의 개인정보 제외 진단을 표시했습니다.', 'success');
  return true;
}

function handleCopyDiagnosticReport() {
  return copyDiagnosticReport({
    chromeApi: chrome,
    clipboard: navigator.clipboard,
    version: chrome.runtime.getManifest().version,
    hostname: state.hostname,
    matchedDomain: state.matchedKey,
    SHARED,
    onStatus: showDiagnosticStatus
  });
}

function handleShowDiagnosticReport() {
  return showDiagnosticReport({
    chromeApi: chrome,
    version: chrome.runtime.getManifest().version,
    hostname: state.hostname,
    matchedDomain: state.matchedKey,
    SHARED,
    output: elements.diagnosticOutput,
    onStatus: showDiagnosticStatus
  });
}

async function handleGlobalToggle() {
  const nextEnabled = state.globalEnabled === false;
  try {
    const result = await SHARED.safeSyncSet({ enabled: nextEnabled }, chrome.storage.local);
    state.lastWriteFallback = Boolean(result && result.fallback);
  } catch (err) {
    console.error('[Right-click on Web] failed to persist global toggle', err);
  }
}

async function handleDomainToggle() {
  if (!state.hostname) {
    return;
  }
  // The button reflects "what would happen if session were not
  // active". Flipping it writes an explicit domain entry that
  // preserves the existing preset/features from the matched entry
  // (parent or exact) so the profile is NOT silently reset.
  const currentDomainDecision = domainDecisionIgnoringSession();
  const nextEnabled = !currentDomainDecision;
  const matchedEntry = state.matchedKey && state.domainSettings
    ? state.domainSettings[state.matchedKey]
    : null;
  const entry = computeProfilePreservingEntry(matchedEntry, { enabled: nextEnabled }, SHARED);
  await writeDomainSettings({ [state.hostname]: entry });
}

async function handleModeSelect(mode) {
  if (!state.hostname) {
    return;
  }
  if (mode !== SHARED.MODE_LITE && mode !== SHARED.MODE_ULTIMATE) {
    return;
  }
  // Writing a mode persists it to the domainSettings entry. We
  // preserve the existing preset/features from the matched entry
  // (parent or exact) so changing mode does NOT silently reset the
  // profile. If no domain entry exists, we create one with
  // enabled=true and the chosen mode.
  const matchedEntry = state.matchedKey && state.domainSettings
    ? state.domainSettings[state.matchedKey]
    : null;
  const entry = computeProfilePreservingEntry(matchedEntry, { mode }, SHARED);
  await writeDomainSettings({ [state.hostname]: entry });
}

async function handlePresetSelect(presetId) {
  if (!state.hostname) {
    return;
  }
  if (
    presetId !== SHARED.PRESET_SAFE
    && presetId !== SHARED.PRESET_COMPLETE
    && presetId !== SHARED.PRESET_UPLOAD_SAFE
  ) {
    return;
  }
  // Session does NOT block preset selection — session overrides
  // enabled only, while the profile continues to govern the tab.
  // The write target is the exact-host entry (state.domainEntry),
  // not the matched parent, so selecting a preset creates or
  // updates the exact-host shadow.
  const entry = computePresetEntry(state.domainEntry, presetId, SHARED);
  await writeDomainSettings({ [state.hostname]: entry });
}

// Read-modify-write helper. Re-reads from storage before writing
// so concurrent clicks (or a faster popup instance) cannot lose
// sibling updates to other hostnames. Uses a promise-tail queue:
// each call chains onto the tail of the previous write, so writes
// execute strictly in call order even when storage reads/writes
// yield asynchronously. The tail reference is never overwritten by
// concurrent callers — each caller captures the current tail and
// chains its own write after it resolves.
let writeDomainSettingsTail = Promise.resolve();
function writeDomainSettings(patch) {
  writeDomainSettingsTail = writeDomainSettingsTail.then(async () => {
    try {
      const fresh = await SHARED.resolveSettings(SHARED.STORAGE_DEFAULTS);
      const merged = (fresh && fresh.domainSettings) || state.domainSettings;
      const updatedDomainSettings = { ...merged, ...patch };
      const result = await SHARED.safeSyncSet({ domainSettings: updatedDomainSettings }, chrome.storage.local);
      state.lastWriteFallback = Boolean(result && result.fallback);
    } catch (err) {
      console.error('[Right-click on Web] failed to persist domain settings', err);
    }
  });
  return writeDomainSettingsTail;
}

async function handleSessionToggle() {
  if (!state.hostname) {
    return;
  }
  const sessionKey = SHARED.sessionKeyFor(state.hostname);
  try {
    if (state.sessionActive) {
      await SHARED.storageRemove(chrome.storage.session, [sessionKey]);
    } else {
      await SHARED.storageSet(chrome.storage.session, { [sessionKey]: true });
    }
  } catch (err) {
    // Surface a user-visible error rather than failing silently.
    // Re-uses the sessionNotice slot so we don't add new DOM.
    console.error('[Right-click on Web] session toggle failed', err);
    if (elements.sessionNotice) {
      elements.sessionNotice.textContent = `세션 토글 실패: ${(err && err.message) || err}`;
      elements.sessionNotice.classList.remove('is-hidden');
    }
  }
}

function handleOpenOptions() {
  chrome.runtime.openOptionsPage();
}

function handleOpenSidePanel() {
  if (!chrome.sidePanel || typeof chrome.sidePanel.open !== 'function') {
    handleOpenOptions();
    return;
  }
  // Keep open() in the original click stack. Any preceding await can consume
  // Chrome's transient user activation and make the API reject.
  const windowId = chrome.windows && typeof chrome.windows.WINDOW_ID_CURRENT === 'number'
    ? chrome.windows.WINDOW_ID_CURRENT
    : -2;
  chrome.sidePanel.open({ windowId }).catch(handleOpenOptions);
}

async function handleTriggerOcr() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'rcow:startCropOnActiveTab' });
    if (!response?.ok) {
      throw new Error(response?.error || 'OCR 영역 선택을 시작하지 못했습니다.');
    }
    window.close();
  } catch (err) {
    console.warn('Failed to send startCropOnActiveTab message:', err);
    showDiagnosticStatus((err && err.message) || 'OCR 영역 선택을 시작하지 못했습니다.', 'error');
  }
}

function applyTheme(theme) {
  const safe = SHARED.resolveTheme(theme);
  document.documentElement.setAttribute('data-theme', safe);
}

function syncThemeButtons() {
  const map = {
    [SHARED.THEME_DARK]: elements.themeDark,
    [SHARED.THEME_NEON]: elements.themeNeon,
    [SHARED.THEME_LIGHT]: elements.themeLight
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

async function handleExceptionAdd() {
  if (!state.hostname) {
    return;
  }
  // Site-level exception = full OFF entry for the exact host.
  // Use the same write path as a normal domain toggle so the
  // profile + migration semantics are consistent.
  const matchedEntry = state.matchedKey && state.domainSettings
    ? state.domainSettings[state.matchedKey]
    : null;
  const entry = computeProfilePreservingEntry(matchedEntry, { enabled: false }, SHARED);
  await writeDomainSettings({ [state.hostname]: entry });
  if (elements.exceptionAddButton) {
    elements.exceptionAddButton.classList.add('is-hidden');
  }
}

async function handleQuickLite() {
  if (!state.hostname || state.sessionActive) return;
  const matchedEntry = state.matchedKey && state.domainSettings
    ? state.domainSettings[state.matchedKey]
    : null;
  const entry = computeProfilePreservingEntry(matchedEntry, { enabled: true, mode: SHARED.MODE_LITE }, SHARED);
  await writeDomainSettings({ [state.hostname]: entry });
}

async function handleQuickSessionOff() {
  if (!state.hostname || !state.sessionAvailable || state.sessionActive) return;
  const sessionKey = SHARED.sessionKeyFor(state.hostname);
  if (state.sessionPaused) {
    await SHARED.storageRemove(chrome.storage.session, [sessionKey]);
  } else {
    await SHARED.storageSet(chrome.storage.session, { [sessionKey]: false });
  }
}

async function handleQuickPermanentOff() {
  if (!state.hostname) return;
  const matchedEntry = state.matchedKey && state.domainSettings
    ? state.domainSettings[state.matchedKey]
    : null;
  const entry = computeProfilePreservingEntry(matchedEntry, { enabled: false }, SHARED);
  await writeDomainSettings({ [state.hostname]: entry });
}

// ---- Wire up ----
elements.toggleButton.addEventListener('click', handleGlobalToggle);
elements.domainToggle.addEventListener('click', handleDomainToggle);
if (elements.exceptionAddButton) {
  elements.exceptionAddButton.addEventListener('click', handleExceptionAdd);
}
if (elements.quickLiteButton) {
  elements.quickLiteButton.addEventListener('click', handleQuickLite);
}
if (elements.quickSessionOffButton) {
  elements.quickSessionOffButton.addEventListener('click', handleQuickSessionOff);
}
if (elements.quickPermanentOffButton) {
  elements.quickPermanentOffButton.addEventListener('click', handleQuickPermanentOff);
}
elements.modeLite.addEventListener('click', () => handleModeSelect(SHARED.MODE_LITE));
elements.modeUltimate.addEventListener('click', () => handleModeSelect(SHARED.MODE_ULTIMATE));
elements.presetSafe.addEventListener('click', () => handlePresetSelect(SHARED.PRESET_SAFE));
elements.presetComplete.addEventListener('click', () => handlePresetSelect(SHARED.PRESET_COMPLETE));
elements.presetUploadSafe.addEventListener('click', () => handlePresetSelect(SHARED.PRESET_UPLOAD_SAFE));
if (elements.themeDark) {
  elements.themeDark.addEventListener('click', () => handleThemeSelect(SHARED.THEME_DARK));
}
if (elements.themeNeon) {
  elements.themeNeon.addEventListener('click', () => handleThemeSelect(SHARED.THEME_NEON));
}
if (elements.themeLight) {
  elements.themeLight.addEventListener('click', () => handleThemeSelect(SHARED.THEME_LIGHT));
}
elements.sessionButton.addEventListener('click', handleSessionToggle);
elements.copyDiagnosticButton.addEventListener('click', handleCopyDiagnosticReport);
elements.showDiagnosticButton.addEventListener('click', handleShowDiagnosticReport);
if (elements.ocrButton) {
  elements.ocrButton.addEventListener('click', handleTriggerOcr);
}
elements.openOptionsButton.addEventListener('click', handleOpenOptions);
if (elements.openSidePanelButton) {
  elements.openSidePanelButton.addEventListener('click', handleOpenSidePanel);
}

// ---- Keyboard radiogroup for mode toggle (roving tabindex) ----
const KB = globalThis.RIGHT_CLICK_ON_WEB_KEYBOARD_UTILS;
const hasKeyboardUtils = Boolean(
  KB
  && typeof KB.getNextModeFromKeydown === 'function'
  && typeof KB.getNextPresetFromKeydown === 'function'
  && typeof KB.getNextValueFromKeydown === 'function'
);
if (!hasKeyboardUtils) {
  console.warn('[Right-click on Web] keyboard-utils unavailable; arrow-key navigation disabled');
}

function handleModeKeydown(event) {
  if (!hasKeyboardUtils) return;
  const lite = elements.modeLite;
  const ultimate = elements.modeUltimate;
  if (!lite || !ultimate) return;
  if (lite.disabled && ultimate.disabled) return;

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
  handleModeSelect(nextMode);
}

elements.modeLite.addEventListener('keydown', handleModeKeydown);
elements.modeUltimate.addEventListener('keydown', handleModeKeydown);

// ---- Keyboard radiogroup for preset toggle (roving tabindex) ----
function handlePresetKeydown(event) {
  if (!hasKeyboardUtils) return;
  const buttons = [
    { el: elements.presetSafe, id: KB.PRESET_SAFE },
    { el: elements.presetComplete, id: KB.PRESET_COMPLETE },
    { el: elements.presetUploadSafe, id: KB.PRESET_UPLOAD_SAFE }
  ];
  if (buttons.every(({ el }) => el.disabled)) return;

  const currentPreset = resolveCurrentPreset(event.currentTarget, buttons, KB);
  const nextPreset = KB.getNextPresetFromKeydown(currentPreset, event.key);
  if (!nextPreset) return;

  event.preventDefault();
  const next = buttons.find(({ id }) => id === nextPreset);
  if (!next) return;
  // Clear the old focus anchor's tabindex so only one Tab entry
  // point remains after navigation.
  const oldAnchor = buttons.find(({ el }) => el.getAttribute('tabindex') === '0');
  if (oldAnchor) {
    oldAnchor.el.setAttribute('tabindex', '-1');
  }
  next.el.setAttribute('tabindex', '0');
  next.el.focus();
  handlePresetSelect(nextPreset);
}

elements.presetSafe.addEventListener('keydown', handlePresetKeydown);
elements.presetComplete.addEventListener('keydown', handlePresetKeydown);
elements.presetUploadSafe.addEventListener('keydown', handlePresetKeydown);

function handleThemeKeydown(event) {
  if (!hasKeyboardUtils) return;
  const buttons = [
    { el: elements.themeDark, id: SHARED.THEME_DARK },
    { el: elements.themeNeon, id: SHARED.THEME_NEON },
    { el: elements.themeLight, id: SHARED.THEME_LIGHT }
  ].filter(({ el }) => Boolean(el));
  const current = buttons.find(({ el }) => el === event.currentTarget);
  if (!current) return;
  const nextTheme = KB.getNextValueFromKeydown(buttons.map(({ id }) => id), current.id, event.key);
  if (!nextTheme) return;

  event.preventDefault();
  const next = buttons.find(({ id }) => id === nextTheme);
  if (!next) return;
  next.el.focus();
  handleThemeSelect(nextTheme);
}

elements.themeDark?.addEventListener('keydown', handleThemeKeydown);
elements.themeNeon?.addEventListener('keydown', handleThemeKeydown);
elements.themeLight?.addEventListener('keydown', handleThemeKeydown);

// Re-render whenever storage changes — covers both same-tab updates
// and the rare case where another popup instance wrote first.
// Coalesces concurrent onChanged fires into a single in-flight
// loadState() so a late-arriving read cannot overwrite a fresher
// one (analogous to content.js's resolvePromise).
let loadStatePromise = null;
function reloadState() {
  if (!loadStatePromise) {
    loadStatePromise = loadState()
      .catch(() => null)
      .finally(() => { loadStatePromise = null; });
  }
  return loadStatePromise;
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  let needsReload = false;
  if (areaName === 'local' || areaName === 'sync') {
    if (changes.enabled || changes.domainSettings || changes.theme) {
      needsReload = true;
    }
  } else if (areaName === 'session') {
    needsReload = true;
  }
  if (needsReload) {
    reloadState().then(render).catch(() => {
      // Storage hiccup — leave previous render in place.
    });
  }
});

// Initial load + render.
loadState().then(render).catch(() => {
  // First-load failure shouldn't break the popup; show fallback state.
  render();
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    computeMainWorldNotice,
    computePresetSafetySuffix,
    classifyPreset,
    computePresetState,
    computePresetEntry,
    computeProfilePreservingEntry,
    computeEffectiveSourceText,
    computePresetTabindex,
    resolveCurrentPreset,
    presetLabelKorean,
    advancedPresetLabelKorean,
    computeFeatureImpact,
    RECOVERY_FEATURE_ROWS,
    requestDiagnosticBridge,
    copyAllowedCounters,
    buildDiagnosticReport,
    copySafeFeatureMap,
    serializeDiagnosticReport,
    copyDiagnosticReport,
    showDiagnosticReport
  };
}
