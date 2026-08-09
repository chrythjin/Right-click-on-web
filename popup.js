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
  sessionActive: false,
  effectiveEnabled: true,
  effectiveMode: SHARED.DEFAULT_MODE,
  syncAvailable: false,
  syncBytesInUse: 0,
  lastWriteFallback: false
};

const elements = {
  toggleButton: document.getElementById('toggleButton'),
  statusText: document.getElementById('statusText'),
  domainText: document.getElementById('domainText'),
  domainHint: document.getElementById('domainHint'),
  domainToggle: document.getElementById('domainToggle'),
  modeLite: document.getElementById('modeLite'),
  modeUltimate: document.getElementById('modeUltimate'),
  modeHint: document.getElementById('modeHint'),
  sessionButton: document.getElementById('sessionButton'),
  sessionNotice: document.getElementById('sessionNotice'),
  syncUsage: document.getElementById('syncUsage'),
  openOptionsButton: document.getElementById('openOptionsButton'),
  openSidePanelButton: document.getElementById('openSidePanelButton')
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
    merged = { enabled: true, domainSettings: {} };
  }
  state.globalEnabled = merged.enabled !== false;
  state.domainSettings = merged.domainSettings && typeof merged.domainSettings === 'object'
    ? merged.domainSettings
    : {};
  state.domainEntry = state.hostname && Object.prototype.hasOwnProperty.call(state.domainSettings, state.hostname)
    ? state.domainSettings[state.hostname]
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
    } catch (_) {
      state.sessionActive = false;
    }
  }

  state.effectiveEnabled = state.sessionActive
    || SHARED.isDomainEnabled(state.globalEnabled, state.domainSettings, state.hostname);
  // Session always implies ultimate. Otherwise inherit domain mode
  // (or default when no entry).
  state.effectiveMode = state.sessionActive
    ? SHARED.MODE_ULTIMATE
    : state.domainMode;

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

  // ---- Domain toggle ----
  if (!state.hostname) {
    elements.domainText.textContent = '이 페이지에서는 도메인 설정 불가';
    elements.domainText.classList.add('is-unavailable');
    elements.domainHint.textContent = 'http(s) 페이지를 방문하면 도메인별 설정이 표시됩니다.';
    elements.domainToggle.disabled = true;
    elements.domainToggle.textContent = '—';
    elements.domainToggle.classList.remove('is-off');
    elements.sessionButton.disabled = true;
    elements.modeLite.disabled = true;
    elements.modeUltimate.disabled = true;
    elements.modeHint.textContent = '도메인 설정 가능 시 모드를 선택할 수 있습니다.';
    return;
  }

  elements.domainText.textContent = state.hostname;
  elements.domainText.classList.remove('is-unavailable');

  const domainDecision = domainDecisionIgnoringSession();
  elements.domainToggle.disabled = false;
  elements.domainToggle.textContent = domainDecision ? 'ON' : 'OFF';
  elements.domainToggle.classList.toggle('is-off', !domainDecision);
  elements.domainToggle.setAttribute('aria-pressed', String(domainDecision));

  if (state.sessionActive) {
    elements.domainHint.textContent = '세션 모드 활성 — 페이지 새로고침 후 도메인 설정 적용';
    elements.domainHint.classList.add('is-domain-off');
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
  if (state.sessionActive) {
    elements.modeHint.textContent = '세션 활성 중 — 잠시 후 새로고침되며 Ultimate로 동작합니다.';
  } else if (!hasDomainEntry) {
    elements.modeHint.textContent = 'Lite는 우클릭·복사 차단만 완화합니다 (CSS 주입 없음). 도메인 ON 후 모드를 선택하면 저장됩니다.';
  } else {
    elements.modeHint.textContent = activeMode === SHARED.MODE_LITE
      ? 'Lite — 우클릭·복사 차단만 완화 (페이지 CSS 주입 없음)'
      : 'Ultimate — 우클릭·선택·복사·오버레이 모두 완화 (기본)';
  }

  // ---- Session button ----
  elements.sessionButton.disabled = !state.sessionAvailable;
  elements.sessionButton.classList.toggle('is-active', state.sessionActive);
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
  // active". Flipping it writes an explicit domain entry. v0.5.0:
  // the entry shape is { enabled, mode }; we preserve the existing
  // mode (or default) when toggling enabled.
  const currentDomainDecision = domainDecisionIgnoringSession();
  const nextEnabled = !currentDomainDecision;
  const preservedMode = state.domainMode || SHARED.DEFAULT_MODE;
  await writeDomainSettings({ [state.hostname]: { enabled: nextEnabled, mode: preservedMode } });
}

async function handleModeSelect(mode) {
  if (!state.hostname) {
    return;
  }
  if (mode !== SHARED.MODE_LITE && mode !== SHARED.MODE_ULTIMATE) {
    return;
  }
  // v0.5.0: writing a mode persists it to the domainSettings entry.
  // If no domain entry exists, we create one with enabled=true and
  // the chosen mode so the user's choice is honored on reload.
  // If a domain entry exists, we keep its enabled flag and only
  // change mode.
  const parsed = SHARED.parseDomainSetting(state.domainEntry);
  const enabled = state.domainEntry === null ? true : parsed.enabled;
  await writeDomainSettings({ [state.hostname]: { enabled, mode } });
}

// Read-modify-write helper. Re-reads from storage before writing
// so concurrent clicks (or a faster popup instance) cannot lose
// sibling updates to other hostnames. Coalesces via an in-flight
// promise so back-to-back clicks see the latest persisted state.
let writeDomainSettingsPromise = null;
async function writeDomainSettings(patch) {
  if (writeDomainSettingsPromise) {
    await writeDomainSettingsPromise.catch(() => {});
  }
  writeDomainSettingsPromise = (async () => {
    try {
      const fresh = await SHARED.resolveSettings(SHARED.STORAGE_DEFAULTS);
      const merged = (fresh && fresh.domainSettings) || state.domainSettings;
      const updatedDomainSettings = { ...merged, ...patch };
      const result = await SHARED.safeSyncSet({ domainSettings: updatedDomainSettings }, chrome.storage.local);
      state.lastWriteFallback = Boolean(result && result.fallback);
    } catch (err) {
      console.error('[Right-click on Web] failed to persist domain settings', err);
    }
  })();
  try {
    await writeDomainSettingsPromise;
  } finally {
    writeDomainSettingsPromise = null;
  }
}

async function handleSessionToggle() {
  if (!state.hostname) {
    return;
  }
  const sessionKey = SHARED.sessionKeyFor(state.hostname);
  if (state.sessionActive) {
    await SHARED.storageRemove(chrome.storage.session, [sessionKey]);
  } else {
    await SHARED.storageSet(chrome.storage.session, { [sessionKey]: true });
  }
}

function handleOpenOptions() {
  chrome.runtime.openOptionsPage();
}

async function handleOpenSidePanel() {
  if (!chrome.sidePanel || typeof chrome.sidePanel.open !== 'function') {
    handleOpenOptions();
    return;
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && typeof tab.windowId === 'number') {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      return;
    }
  } catch (_) {
    // Fall through to options page.
  }
  handleOpenOptions();
}

// ---- Wire up ----
elements.toggleButton.addEventListener('click', handleGlobalToggle);
elements.domainToggle.addEventListener('click', handleDomainToggle);
elements.modeLite.addEventListener('click', () => handleModeSelect(SHARED.MODE_LITE));
elements.modeUltimate.addEventListener('click', () => handleModeSelect(SHARED.MODE_ULTIMATE));
elements.sessionButton.addEventListener('click', handleSessionToggle);
elements.openOptionsButton.addEventListener('click', handleOpenOptions);
if (elements.openSidePanelButton) {
  elements.openSidePanelButton.addEventListener('click', handleOpenSidePanel);
}

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
    if (changes.enabled || changes.domainSettings) {
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
