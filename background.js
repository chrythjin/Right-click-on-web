// Right-click on Web — service worker
//
// Responsibilities:
//   - Initialize default storage shape on install/update
//   - Migrate pre-v0.3.0 storage shape (only `enabled`) into the
//     expanded shape (enabled + domainSettings) without overwriting
//     user-set values
//   - v0.4.0: migrate v0.3.0 local-only data into chrome.storage.sync
//     so settings roam across the user's signed-in devices
//
// Shared helpers come from shared.js via importScripts. The popup and
// content script each load shared.js through their own <script> tag,
// but the data they read/write flows through the same chrome.storage
// surface, so the three contexts agree automatically.

importScripts('shared.js');

const SHARED = globalThis.RIGHT_CLICK_ON_WEB_SHARED;
const DEFAULT_SETTINGS = SHARED.STORAGE_DEFAULTS;

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
    syncData = await SHARED.storageGet(chrome.storage.sync, DEFAULT_SETTINGS);
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
    localData = await SHARED.storageGet(chrome.storage.local, DEFAULT_SETTINGS);
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
async function migrateDomainSettings() {
  let localData;
  try {
    localData = await SHARED.storageGet(chrome.storage.local, DEFAULT_SETTINGS);
  } catch (_) {
    return;
  }
  if (!localData || !localData.domainSettings) {
    return;
  }
  const normalized = SHARED.normalizeDomainSettings(localData.domainSettings);
  // Only write back when something actually changed. The comparison
  // is a quick structural check; if every entry is already in the
  // new shape, the strings will match.
  if (JSON.stringify(normalized) === JSON.stringify(localData.domainSettings)) {
    return;
  }
  try {
    await SHARED.storageSet(chrome.storage.local, {
      domainSettings: normalized
    });
  } catch (err) {
    if (!SHARED.isQuotaExceeded(err)) {
      throw err;
    }
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  initializeStorage();
  // reason='update' covers v0.3.0→v0.4.0 upgrade; reason='install'
  // covers brand-new users (who have no local data to migrate).
  if (details && details.reason === 'update') {
    migrateLocalToSync();
    migrateDomainSettings();
  }
});

// onStartup fires on browser launch (after the service worker has
// been terminated). Storage data persists across restarts, so we do
// not need to re-initialize — but we do verify the shape in case the
// data was cleared externally (e.g. by user via chrome://extensions).
chrome.runtime.onStartup.addListener(() => {
  initializeStorage();
  // Don't migrate on startup: only on actual install/update events
  // to avoid hammering sync quota with startup retries.
});
