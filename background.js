// Right-click on Web — background worker/event page
//
// Responsibilities:
//   - Initialize default storage shape on install/update
//   - Migrate pre-v0.3.0 storage shape (only `enabled`) into the
//     expanded shape (enabled + domainSettings) without overwriting
//     user-set values
//   - v0.4.0: migrate v0.3.0 local-only data into chrome.storage.sync
//     so settings roam across the user's signed-in devices
//   - v0.5.0: normalize legacy boolean domainSettings into { enabled, mode }
//   - v0.6.0: register the browser action context menu, open the side
//     panel on a sidePanel-aware browser, and surface a Firefox notice
//     when chrome.storage.session is unavailable.
//
// Chrome loads this file as an MV3 service worker. Firefox loads the same
// file as an MV3 non-persistent background script because Firefox does not
// yet support extension background service workers.
//
// Shared helpers come from shared.js via importScripts. The popup and
// content script each load shared.js through their own <script> tag,
// but the data they read/write flows through the same chrome.storage
// surface, so the three contexts agree automatically.

if (!globalThis.RIGHT_CLICK_ON_WEB_SHARED && typeof importScripts === 'function') {
  importScripts('shared.js');
}

const SHARED = globalThis.RIGHT_CLICK_ON_WEB_SHARED;
const DEFAULT_SETTINGS = SHARED.STORAGE_DEFAULTS;

const CONTEXT_MENU_IDS = Object.freeze({
  GLOBAL_TOGGLE: 'rcow-global-toggle',
  OPEN_PANEL: 'rcow-open-panel',
  OPEN_OPTIONS: 'rcow-open-options'
});

async function exposeSessionStorageToContentScripts() {
  if (typeof chrome.storage.session?.setAccessLevel !== 'function') {
    return;
  }
  try {
    await chrome.storage.session.setAccessLevel({
      accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS'
    });
  } catch (_) {}
}

void exposeSessionStorageToContentScripts();

function initializeStorage() {
  chrome.storage.local.get(DEFAULT_SETTINGS, (existing) => {
    // Preserve whatever the user already configured; only fill in
    // missing keys with defaults. Pre-v0.3.0 users have no
    // domainSettings key — that's fine, we default to {}.
    const merged = {
      enabled: existing.enabled !== false,
      domainSettings: existing.domainSettings && typeof existing.domainSettings === 'object'
        ? existing.domainSettings
        : {}
    };
    chrome.storage.local.set(merged);
  });
}

// v0.4.0 — best-effort one-time migration of local settings into
// chrome.storage.sync. Reads sync first; only writes if sync is
// empty (no enabled flag set and no domainSettings entries). This
// avoids overwriting newer cross-device state with stale local data.
//
// On QuotaExceededError the data stays in local only; popup reads
// sync+local in parallel and sync wins, so the user keeps their
// settings until sync quota frees up.
async function migrateLocalToSync() {
  let syncData;
  try {
    syncData = await SHARED.storageGet(chrome.storage.sync, Object.keys(DEFAULT_SETTINGS));
  } catch (_) {
    return;
  }
  const syncHasState =
    syncData && (syncData.enabled !== undefined || (syncData.domainSettings && Object.keys(syncData.domainSettings).length > 0));
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
  } catch (err) {
    if (SHARED.isQuotaExceeded(err)) {
      // Stays local only; popup's sync+local merge keeps it visible.
    } else {
      // Other error — propagate so it surfaces in extension logs.
      throw err;
    }
  }
}

// v0.5.0 — schema migration of pre-v0.5.0 domainSettings. Old entries
// were plain booleans (`true`/`false`); new entries are objects
// `{ enabled, mode }`. normalizeDomainSettings() handles every
// shape and returns the new shape. Idempotent: re-running produces
// no observable change (booleans are also accepted as input by
// normalizeDomainSettings because their output round-trips).
async function migrateDomainSettings(area) {
  let storedData;
  try {
    storedData = await SHARED.storageGet(area, Object.keys(DEFAULT_SETTINGS));
  } catch (_) {
    return;
  }
  if (!storedData || !storedData.domainSettings) {
    return;
  }
  const normalized = SHARED.normalizeDomainSettings(storedData.domainSettings);
  // Only write back when something actually changed. The comparison
  // is a quick structural check; if every entry is already in the
  // new shape, the strings will match.
  if (JSON.stringify(normalized) === JSON.stringify(storedData.domainSettings)) {
    return;
  }
  try {
    await SHARED.storageSet(area, {
      domainSettings: normalized
    });
  } catch (err) {
    if (!SHARED.isQuotaExceeded(err)) {
      throw err;
    }
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  exposeSessionStorageToContentScripts();
  initializeStorage();
  // reason='update' covers v0.3.0→v0.4.0 upgrade; reason='install'
  // covers brand-new users (who have no local data to migrate).
  if (details && details.reason === 'update') {
    void (async () => {
      await migrateLocalToSync();
      await migrateDomainSettings(chrome.storage.sync);
      await migrateDomainSettings(chrome.storage.local);
    })();
  }
  // v0.6.0 — context menu and side panel wiring runs on both install
  // and update so feature activation happens once the user upgrades.
  registerContextMenus();
  if (chrome.sidePanel && typeof chrome.sidePanel.setPanelBehavior === 'function') {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
  }
});

// onStartup fires on browser launch (after the service worker has
// been terminated). Storage data persists across restarts, so we do
// not need to re-initialize — but we do verify the shape in case the
// data was cleared externally (e.g. by user via chrome://extensions).
chrome.runtime.onStartup.addListener(() => {
  exposeSessionStorageToContentScripts();
  initializeStorage();
  registerContextMenus();
  // Don't migrate on startup: only on actual install/update events
  // to avoid hammering sync quota with startup retries.
});

// v0.6.0 — context menu entries. The browser action icon right-click
// (and toolbar long-press / menu button on Linux) surfaces quick
// toggles plus deep links into the popup, side panel, and options.
// removeAll() then create() keeps the menu idempotent across MV3
// service-worker wake-ups.
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

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (!info || !info.menuItemId) {
    return;
  }
  if (info.menuItemId === CONTEXT_MENU_IDS.GLOBAL_TOGGLE) {
    const settings = await SHARED.resolveSettings(DEFAULT_SETTINGS);
    const next = settings.enabled === false;
    await SHARED.safeSyncSet({ enabled: next }, chrome.storage.local);
    // Rebuild so the menu title reflects the new state on next open.
    registerContextMenus();
    return;
  }
  if (info.menuItemId === CONTEXT_MENU_IDS.OPEN_PANEL) {
    if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
      const window = await currentWindow();
      if (window && typeof window.id === 'number') {
        chrome.sidePanel.open({ windowId: window.id }).catch(() => openOptionsFallback());
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

function openOptionsFallback() {
  if (chrome.runtime && typeof chrome.runtime.openOptionsPage === 'function') {
    chrome.runtime.openOptionsPage();
  }
}

function currentWindow() {
  return new Promise((resolve) => {
    try {
      chrome.windows.getCurrent((win) => resolve(win));
    } catch (_) {
      resolve(null);
    }
  });
}

// Rebuild context menu when storage flips so the toggle label is honest.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if ((areaName === 'local' || areaName === 'sync') && changes.enabled) {
    registerContextMenus();
  }
});
