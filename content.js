// Right-click on Web — ISOLATED-world content script
//
// Runs at document_start in the extension's isolated JS context.
// Handles DOM cleanup, attribute removal, capture-phase event
// interceptors, MutationObserver, periodic rescan, and shadow-root
// recursion. Shared helpers (hostname parsing, domain matching,
// storage promises) come from shared.js, loaded just before this
// file via manifest.json content_scripts[0].js.
//
// v0.3.0 additions:
//   - async resolveEnabled() resolves the active state from
//     session (Chrome session storage, transient) > local
//     domainSettings > global enabled.
//   - resolveAndApply() coalesces concurrent re-resolves into a
//     single in-flight promise (race-condition guard).
//   - chrome.storage.onChanged listens to BOTH 'local' and 'session'
//     storage areas so domain toggles, session toggles, and global
//     toggles all trigger a re-resolve.

const SHARED = globalThis.RIGHT_CLICK_ON_WEB_SHARED;

const RIGHT_CLICK_ON_WEB = {
  styleId: 'right-click-on-web-style',
  markerAttribute: 'data-right-click-on-web',
  blockedAttributes: [
    'oncontextmenu',
    'onselectstart',
    'oncopy',
    'oncut',
    'onpaste',
    'ondragstart'
  ],
  blockedEvents: [
    'contextmenu',
    'selectstart',
    'copy',
    'cut',
    'paste',
    'dragstart',
    'dragover',
    'drop',
    'mousedown',
    'mouseup'
  ],
  // Periodic re-scan interval (ms). Catches anything MutationObserver
  // missed, e.g. attributeFilter-blind mutations on detached subtrees
  // that get re-attached. Paused while the tab is hidden.
  // Raised from 2000ms in v0.6.2 — MutationObserver already covers
  // ~all observed mutations within a tick, so 5s is enough as a
  // detached-subtree safety net without burning main-thread cycles.
  rescanIntervalMs: 5000,
  // Cross-world stats channel. Content scripts run in an isolated
  // world, so window.__rightClickOnWebStats is invisible to page
  // scripts. We mirror the stats JSON into a DOM element under
  // documentElement — DOM nodes are shared across worlds, so the
  // manual test page (and any future debugging surface) can read
  // it via document.getElementById(STATS_DOM_ID).textContent.
  // The element is a <script type="application/json"> to avoid
  // any chance of execution or visual rendering.
  statsDomId: '__rightClickOnWebStats'
};

let enabled = true;
let isActive = false;
let currentMode = SHARED.DEFAULT_MODE;
let eventController = null;
let observer = null;
let shadowObserverMap = new Map();
let knownShadowRoots = new Set();
let rescanTimer = null;
let stats = createStats();
let statsSyncQueued = false;

function createStats() {
  const result = {
    attributeRemovals: Object.fromEntries(
      RIGHT_CLICK_ON_WEB.blockedAttributes.map((name) => [name, 0])
    ),
    eventInterceptions: Object.fromEntries(
      RIGHT_CLICK_ON_WEB.blockedEvents.map((name) => [name, 0])
    ),
    overlaysNeutralized: 0,
    shadowRootsScanned: 0,
    periodicRescans: 0,
    // Resolution diagnostics — surfaces which layer (session, domain,
    // global) decided the current state, and which mode (lite /
    // ultimate) is currently applied. Useful for QA + the manual
    // test page.
    resolveSource: 'initial',
    matchedDomain: null,
    mode: SHARED.DEFAULT_MODE
  };
  return result;
}

function resetStats() {
  stats = createStats();
  window.__rightClickOnWebStats = stats;
  syncStatsToDom();
}

// Create the cross-world stats element if it doesn't exist yet.
// documentElement is available at document_start; head is preferred when
// Chrome has already created it. Subsequent calls reuse the same element.
function ensureStatsDomElement() {
  let element = document.getElementById(RIGHT_CLICK_ON_WEB.statsDomId);
  if (element) {
    return element;
  }
  try {
    element = document.createElement('script');
    element.type = 'application/json';
    element.id = RIGHT_CLICK_ON_WEB.statsDomId;
    // Marker so other observers can distinguish from arbitrary
    // <script type="application/json"> elements the page may add.
    element.setAttribute(RIGHT_CLICK_ON_WEB.markerAttribute, 'true');
    (document.head || document.documentElement).appendChild(element);
  } catch (_) {
    // document.head/document.documentElement both unavailable —
    // nothing we can do; window.__rightClickOnWebStats remains
    // the fallback for DevTools inspection.
    return null;
  }
  return element;
}

// Mirror the current stats object into the cross-world DOM element.
// Called from key checkpoints and batched counter updates so the latest
// snapshot is available without a timer.
// The stringify cost for a ~10-counter object is negligible.
function syncStatsToDom() {
  const element = ensureStatsDomElement();
  if (!element) {
    return;
  }
  try {
    element.textContent = JSON.stringify(stats);
  } catch (_) {
    // Circular references or quota — leave the previous snapshot in
    // place rather than clear it, so the page sees stale-but-real
    // data instead of an empty string.
  }
}

function scheduleStatsSync() {
  if (statsSyncQueued) {
    return;
  }
  statsSyncQueued = true;
  queueMicrotask(() => {
    statsSyncQueued = false;
    syncStatsToDom();
  });
}

function bumpAttributeRemoval(attribute) {
  const counter = stats.attributeRemovals[attribute];
  if (typeof counter === 'number') {
    stats.attributeRemovals[attribute] = counter + 1;
    scheduleStatsSync();
  }
}

function bumpEventInterception(eventName) {
  const counter = stats.eventInterceptions[eventName];
  if (typeof counter === 'number') {
    stats.eventInterceptions[eventName] = counter + 1;
    scheduleStatsSync();
  }
}

function isEditableElement(target) {
  if (!(target instanceof Element)) {
    return false;
  }

  return target.isContentEditable || Boolean(target.closest('input, textarea, select'));
}

function isNonSecondaryMouseInput(eventName, event) {
  return (eventName === 'mousedown' || eventName === 'mouseup') && event.button !== 2;
}

function handleInterceptedEvent(eventName) {
  return (event) => {
    if (isEditableElement(event.target) || isNonSecondaryMouseInput(eventName, event)) {
      return;
    }
    bumpEventInterception(eventName);
    event.stopImmediatePropagation();
  };
}

function selectionStyleFor(root) {
  if (root === document) {
    return document.getElementById(RIGHT_CLICK_ON_WEB.styleId);
  }
  return root.querySelector(`#${RIGHT_CLICK_ON_WEB.styleId}`);
}

function injectSelectionStyle(root = document) {
  if (selectionStyleFor(root)) {
    return;
  }

  const style = document.createElement('style');
  style.id = RIGHT_CLICK_ON_WEB.styleId;
  style.setAttribute(RIGHT_CLICK_ON_WEB.markerAttribute, 'true');
  style.textContent = `
    *:not(input):not(textarea),
    *:not(input):not(textarea)::before,
    *:not(input):not(textarea)::after {
      -webkit-user-select: text !important;
      -moz-user-select: text !important;
      -ms-user-select: text !important;
      user-select: text !important;
      -webkit-user-drag: auto !important;
      -moz-user-drag: auto !important;
      -webkit-touch-callout: default !important;
    }
    img, a {
      -webkit-user-drag: auto !important;
      -moz-user-drag: auto !important;
      user-drag: auto !important;
    }
  `;

  const parent = root === document
    ? (document.head || document.documentElement)
    : root;
  parent.appendChild(style);
}

function injectSelectionStyles() {
  injectSelectionStyle(document);
  sweepDetachedShadowRoots();
  for (const shadow of knownShadowRoots) {
    injectSelectionStyle(shadow);
  }
}

function removeSelectionStyles() {
  selectionStyleFor(document)?.remove();
  for (const shadow of knownShadowRoots) {
    selectionStyleFor(shadow)?.remove();
  }
  sweepDetachedShadowRoots();
}

function neutralizeBlockOverlay(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const declaredPosition = (element.style.position || '').toLowerCase().trim();
  if (declaredPosition !== 'absolute' && declaredPosition !== 'fixed') {
    return false;
  }

  if ((element.textContent || '').trim().length > 0) {
    return false;
  }

  element.style.setProperty('pointer-events', 'none', 'important');
  return true;
}

function isTraversableRoot(root) {
  return (
    root instanceof Document ||
    root instanceof Element ||
    root instanceof DocumentFragment ||
    (typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot)
  );
}

function collectBlockingAttributeCandidates(root) {
  const selector = RIGHT_CLICK_ON_WEB.blockedAttributes.map((attribute) => `[${attribute}]`).join(',');
  const candidates = [];

  if (root instanceof Element && root.matches(selector)) {
    candidates.push(root);
  }

  candidates.push(...root.querySelectorAll(selector));

  return candidates;
}

// Pages that bypass content attributes via
// `Object.defineProperty(element, 'oncontextmenu', {value: fn, configurable:false})`
// leave the IDL property in place even after `removeAttribute()`. Unlock
// non-configurable descriptors with a property-by-property copy that
// preserves accessors, then null the value.
function clearLockedIdlAttribute(element, attribute) {
  let descriptor;
  try {
    descriptor = Object.getOwnPropertyDescriptor(element, attribute);
  } catch (_) {
    return;
  }
  if (!descriptor) {
    // Normal inline handlers usually live behind a prototype accessor,
    // so there is no own descriptor. Removing the HTML attribute does
    // not reliably clear an already-compiled handler in every Chromium
    // path; explicitly drive the IDL setter as well.
    try {
      element[attribute] = null;
    } catch (_) {
      // Read-only prototype accessor.
    }
    return;
  }
  if (descriptor.configurable) {
    try {
      element[attribute] = null;
    } catch (_) {
      // Read-only accessor or otherwise non-writable.
    }
    return;
  }
  try {
    const unlocked = {
      configurable: true,
      enumerable: descriptor.enumerable === true
    };
    if ('value' in descriptor) {
      unlocked.value = null;
      unlocked.writable = true;
    } else if (typeof descriptor.set === 'function') {
      unlocked.set = descriptor.set;
      if (typeof descriptor.get === 'function') {
        unlocked.get = descriptor.get;
      }
    } else if (typeof descriptor.get === 'function') {
      unlocked.get = () => null;
    }
    Object.defineProperty(element, attribute, unlocked);
    if (typeof descriptor.set === 'function') {
      try {
        element[attribute] = null;
      } catch (_) {
        // Setter rejected the assignment; the getter override already
        // nulled reads on this attribute.
      }
    }
  } catch (_) {
    // Frozen prototype chain.
  }
}

function discoverShadowHosts(root) {
  const ownerDocument = root.ownerDocument || document;
  if (!ownerDocument || typeof ownerDocument.createTreeWalker !== 'function') {
    return [];
  }
  const walker = ownerDocument.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT,
    null
  );
  const hosts = [];
  if (root instanceof Element && root.shadowRoot) {
    hosts.push(root);
  }
  let current = walker.nextNode();
  while (current) {
    if (current.shadowRoot) {
      hosts.push(current);
    }
    current = walker.nextNode();
  }
  return hosts;
}

// Recurse into open shadow roots. observedShadowRoots caches roots
// already scanned + observed so repeated walks stay bounded.
// (content-main.js converts `mode:'closed'` --`mode:'open'` at
// attach time, so anything created after document_start is open.)
function removeBlockingAttributes(root = document) {
  if (!isTraversableRoot(root)) {
    return;
  }

  sweepDetachedShadowRoots();

  const candidates = collectBlockingAttributeCandidates(root);

  for (const element of candidates) {
    for (const attribute of RIGHT_CLICK_ON_WEB.blockedAttributes) {
      if (element.hasAttribute(attribute)) {
        element.removeAttribute(attribute);
        bumpAttributeRemoval(attribute);
      }
      clearLockedIdlAttribute(element, attribute);
    }
    if (neutralizeBlockOverlay(element)) {
      stats.overlaysNeutralized += 1;
      scheduleStatsSync();
    }
  }

  for (const host of discoverShadowHosts(root)) {
    const shadow = host.shadowRoot;
    knownShadowRoots.add(shadow);
    if (currentMode === SHARED.MODE_ULTIMATE) {
      injectSelectionStyle(shadow);
    }
    if (shadowObserverMap.has(shadow)) {
      continue;
    }
    stats.shadowRootsScanned += 1;
    scheduleStatsSync();
    const observerInstance = attachMutationObserver(shadow);
    if (observerInstance) {
      shadowObserverMap.set(shadow, observerInstance);
    }
    removeBlockingAttributes(shadow);
  }
}

function sweepDetachedShadowRoots() {
  for (const shadow of knownShadowRoots) {
    if (shadow.host.isConnected) {
      continue;
    }
    selectionStyleFor(shadow)?.remove();
    const shadowObserver = shadowObserverMap.get(shadow);
    if (shadowObserver) {
      shadowObserver.disconnect();
      shadowObserverMap.delete(shadow);
    }
    knownShadowRoots.delete(shadow);
  }
}

function attachMutationObserver(root) {
  if (!isTraversableRoot(root)) {
    return null;
  }

  const target = root === document ? (document.documentElement || document) : root;

  const observerInstance = new MutationObserver((mutations) => {
    if (
      root !== document &&
      ((target instanceof Element && !target.isConnected) ||
        (typeof ShadowRoot !== 'undefined' && target instanceof ShadowRoot && !target.host.isConnected))
    ) {
      observerInstance.disconnect();
      selectionStyleFor(root)?.remove();
      shadowObserverMap.delete(root);
      knownShadowRoots.delete(root);
      return;
    }

    if (root === document) {
      sweepDetachedShadowRoots();
    }

    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.target instanceof Element) {
        if (root === document || mutation.target.isConnected) {
          removeBlockingAttributes(mutation.target);
        }
      }

      for (const node of mutation.addedNodes) {
        if (
          (node instanceof Element || node instanceof DocumentFragment) &&
          node.isConnected
        ) {
          removeBlockingAttributes(node);
        }
      }
    }
  });

  observerInstance.observe(target, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: RIGHT_CLICK_ON_WEB.blockedAttributes
  });

  return observerInstance;
}

function observeBlockingChanges() {
  observer = attachMutationObserver(document);
}

function addEventInterceptors() {
  if (eventController) {
    return;
  }

  eventController = new AbortController();

  for (const eventName of RIGHT_CLICK_ON_WEB.blockedEvents) {
    document.addEventListener(eventName, handleInterceptedEvent(eventName), {
      capture: true,
      passive: false,
      signal: eventController.signal
    });
  }
}

function scheduleIdle(callback) {
  if (typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(callback, { timeout: 5000 });
  }
  return setTimeout(callback, 1000);
}

function runPeriodicRescan() {
  stats.periodicRescans += 1;
  scheduleStatsSync();
  scheduleIdle(() => removeBlockingAttributes());
}

function startPeriodicRescan() {
  if (rescanTimer) {
    return;
  }

  rescanTimer = setInterval(() => {
    if (document.visibilityState === 'hidden') {
      return;
    }
    runPeriodicRescan();
  }, RIGHT_CLICK_ON_WEB.rescanIntervalMs);
}

function stopPeriodicRescan() {
  if (rescanTimer) {
    clearInterval(rescanTimer);
    rescanTimer = null;
  }
}

function enableUnlocker() {
  if (isActive) {
    return;
  }

  resetStats();
  // v0.5.0: only inject CSS in ultimate mode. In lite mode the page
  // gets only the MAIN-world prototype patches (which already ran
  // at document_start) and the capture-phase interceptors below —
  // no user-select style override, so the page's own user-select
  // rules are preserved.
  if (currentMode === SHARED.MODE_ULTIMATE) {
    injectSelectionStyles();
  }
  removeBlockingAttributes();
  addEventInterceptors();
  observeBlockingChanges();
  startPeriodicRescan();

  isActive = true;
}

function disableUnlocker() {
  eventController?.abort();
  eventController = null;

  observer?.disconnect();
  observer = null;

  for (const observerInstance of shadowObserverMap.values()) {
    observerInstance.disconnect();
  }
  shadowObserverMap.clear();

  stopPeriodicRescan();
  removeSelectionStyles();

  knownShadowRoots = new Set();

  isActive = false;
}

// v0.5.0: setEnabled now also takes the resolved mode so the
// unlocker knows whether to inject the CSS override. Pass
// SHARED.DEFAULT_MODE when not using a domain-specific mode.
function setEnabled(nextEnabled, nextMode) {
  const previousMode = currentMode;
  enabled = nextEnabled;
  if (nextMode === SHARED.MODE_LITE || nextMode === SHARED.MODE_ULTIMATE) {
    currentMode = nextMode;
  } else {
    currentMode = SHARED.DEFAULT_MODE;
  }

  if (enabled) {
    if (isActive && previousMode !== currentMode) {
      if (currentMode === SHARED.MODE_ULTIMATE) {
        injectSelectionStyles();
      } else {
        removeSelectionStyles();
      }
    } else {
      enableUnlocker();
    }
  } else {
    disableUnlocker();
  }
}

// ---------------------------------------------------------------------------
// v0.3.0 — multi-layer resolution (session > domain > global)
// ---------------------------------------------------------------------------
//
// resolveEnabled() reads three storage layers in priority order and
// returns { enabled, source, matchedKey, hostname } so callers can
// surface diagnostics if they wish. Order matches the popup's UI
// copy and is documented in AGENTS.md NOTES.
//
// Edge cases handled:
//   - Related opaque frame → inherit a trustworthy parent/referrer host;
//     unresolved opaque descendants fail closed.
//   - Session storage unavailable (older Chromium, dev builds) → skip.
//   - Domain settings entry for a public-suffix key → resolveDomainKey
//     stops broader parent matching (handled in shared.js).

function resolveFrameHostname() {
  const directHostname = SHARED.getHostname(window.location.href);
  if (directHostname) {
    return directHostname;
  }

  try {
    if (window.location.protocol === 'blob:') {
      const blobOrigin = new URL(window.location.href).origin;
      const blobHostname = SHARED.getHostname(blobOrigin);
      if (blobHostname) {
        return blobHostname;
      }
    }
  } catch (_) {}

  try {
    for (const origin of window.location.ancestorOrigins || []) {
      const ancestorHostname = SHARED.getHostname(origin);
      if (ancestorHostname) {
        return ancestorHostname;
      }
    }
  } catch (_) {}

  const referrerHostname = SHARED.getHostname(document.referrer);
  if (referrerHostname) {
    return referrerHostname;
  }

  try {
    return SHARED.getHostname(window.parent.location.href);
  } catch (_) {
    return '';
  }
}

async function resolveEnabled() {
  const directHostname = SHARED.getHostname(window.location.href);
  const hostname = directHostname || resolveFrameHostname();
  if (!directHostname && window !== window.top && !hostname) {
    return {
      enabled: false,
      source: 'opaque-origin-unresolved',
      hostname: '',
      matchedKey: null,
      mode: SHARED.DEFAULT_MODE
    };
  }

  // 1) Session layer — temporary per-hostname override. Wins over
  //    everything because the user explicitly asked for "this session
  //    only" and that intent is narrower than the persistent domain
  //    setting. Session always implies ultimate mode.
  if (hostname && SHARED.isSessionStorageAvailable()) {
    const key = SHARED.sessionKeyFor(hostname);
    try {
      const sessionData = await SHARED.storageGet(chrome.storage.session, key);
      if (sessionData[key] === true) {
        return {
          enabled: true,
          source: 'session',
          hostname,
          matchedKey: null,
          mode: SHARED.MODE_ULTIMATE
        };
      }
    } catch (_) {
      // Quota or transient read failure — fall through to local.
    }
  }

  // 2) Domain + global layer — single round-trip covers both.
  // v0.4.0: read sync + local in parallel; sync wins on conflict.
  // Falls back to local only when sync fails (e.g. sync disabled).
  let settings;
  try {
    settings = await SHARED.resolveSettings(SHARED.STORAGE_DEFAULTS);
  } catch (_) {
    // Storage fully unavailable — leave current state untouched and
    // bail. We do not flip to false just because storage hiccupped.
    return null;
  }
  const globalEnabled = settings.enabled !== false;
  const domainSettings = settings.domainSettings || {};

  if (hostname) {
    const matchedKey = SHARED.resolveDomainKey(hostname, domainSettings);
    if (matchedKey !== null) {
      const entry = domainSettings[matchedKey];
      // Defensive: tolerate unmigrated boolean entries.
      let entryEnabled = false;
      if (typeof entry === 'boolean') {
        entryEnabled = entry !== false;
      } else if (entry && typeof entry === 'object') {
        entryEnabled = entry.enabled !== false;
      }
      const mode = SHARED.resolveMode(hostname, domainSettings) || SHARED.DEFAULT_MODE;
      return {
        enabled: entryEnabled,
        source: 'domain',
        hostname,
        matchedKey,
        mode
      };
    }
  }

  return {
    enabled: globalEnabled,
    source: hostname ? 'global' : 'global-no-host',
    hostname,
    matchedKey: null,
    mode: SHARED.DEFAULT_MODE
  };
}

// Race-condition guard: when storage.onChanged fires multiple times
// in quick succession (e.g. user toggles global + domain in the
// popup within a tick), we coalesce into a single in-flight resolve.
// Returns the existing promise so callers can await it if needed.
let resolvePromise = null;
let resolveQueued = false;
function resolveAndApply() {
  if (resolvePromise) {
    resolveQueued = true;
    return resolvePromise;
  }
  resolvePromise = (async () => {
    try {
      const result = await resolveEnabled();
      if (!result) {
        return;
      }
      setEnabled(result.enabled, result.mode);
      // Surface the decision on the public stats object so the
      // manual test page and any future debugging UI can show
      // *why* the unlocker is on or off.
      try {
        if (window.__rightClickOnWebStats) {
          window.__rightClickOnWebStats.resolveSource = result.source;
          window.__rightClickOnWebStats.matchedDomain = result.matchedKey;
          window.__rightClickOnWebStats.mode = result.mode || SHARED.DEFAULT_MODE;
        }
        // Mirror the updated snapshot across worlds so the manual
        // QA panel (page context) sees the latest decision without
        // needing to scrape window.* from an isolated context.
        syncStatsToDom();
      } catch (_) {
        // Stats object may not exist yet — safe to ignore.
      }
    } catch (_) {
      // Defensive — resolveEnabled already catches its own errors,
      // but a bug in stats surface code must not break the unlocker.
    } finally {
      resolvePromise = null;
      if (resolveQueued) {
        resolveQueued = false;
        resolveAndApply();
      }
    }
  })();
  return resolvePromise;
}

// Install the reversible capture interceptors synchronously at
// document_start. Storage resolution is asynchronous and may be delayed
// or temporarily unavailable; without this guard, inline handlers such as
// <body oncontextmenu="return false"> remain active until resolution ends.
// An OFF result aborts these listeners through disableUnlocker().
addEventInterceptors();

// Resolve the persistent/session settings and mount the DOM/CSS layers.
// When every storage area is temporarily unavailable, the interceptors
// stay active in accordance with the extension's default-enabled contract.
resolveAndApply();

// Storage listener — handles every layer that could flip the
// decision. Re-resolves whenever:
//   - `local.enabled` changes
//   - `local.domainSettings` changes (added/removed/edited)
//   - `sync.enabled` or `sync.domainSettings` changes (v0.4.0)
//   - any `session.*` key changes (per-hostname session toggle)
chrome.storage.onChanged.addListener((changes, areaName) => {
  let shouldResolve = false;

  if (areaName === 'local' || areaName === 'sync') {
    if (changes.enabled || changes.domainSettings) {
      shouldResolve = true;
    }
  } else if (areaName === 'session') {
    // Any session key change could be the session toggle for *this*
    // hostname or for a different hostname. Resolving is cheap, so
    // we just re-resolve.
    shouldResolve = true;
  }

  if (shouldResolve) {
    resolveAndApply();
  }
});
