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

const EVENT_FEATURE_MAP = Object.freeze({
  contextmenu: 'contextMenu',
  selectstart: 'selection',
  copy: 'copyShortcuts',
  cut: 'copyShortcuts',
  paste: 'copyShortcuts',
  dragstart: 'dragStart',
  dragover: 'dragDrop',
  drop: 'dragDrop',
  mousedown: 'contextMenu',
  mouseup: 'contextMenu',
  keydown: 'copyShortcuts'
});

const ATTRIBUTE_FEATURE_MAP = Object.freeze({
  oncontextmenu: 'contextMenu',
  onselectstart: 'selection',
  oncopy: 'copyShortcuts',
  oncut: 'copyShortcuts',
  onpaste: 'copyShortcuts',
  ondragstart: 'dragStart',
  ondragover: 'dragDrop',
  ondrop: 'dragDrop'
});

const RIGHT_CLICK_ON_WEB = {
  styleId: 'right-click-on-web-style',
  markerAttribute: 'data-right-click-on-web',
  blockedAttributes: Object.keys(ATTRIBUTE_FEATURE_MAP),
  blockedEvents: Object.keys(EVENT_FEATURE_MAP).filter((name) => name !== 'keydown'),
  // Periodic re-scan interval (ms). Catches anything MutationObserver
  // Periodic re-scan interval (ms). Catches anything MutationObserver
  // missed, e.g. attributeFilter-blind mutations on detached subtrees
  // that get re-attached. Paused while the tab is hidden.
  // Raised from 2000ms in v0.6.2 — MutationObserver already covers
  // ~all observed mutations within a tick, so 5s is enough as a
  // detached-subtree safety net without burning main-thread cycles.
  rescanIntervalMs: 5000,
  // Legacy stats DOM id for cleanup. To protect web text editors, WYSIWYG
  // canvases, and CMSs from capturing stats JSON during document save, stats
  // are maintained purely in memory and queried on-demand via runtime messages
  // or CustomEvents, rather than kept as persistent DOM elements.
  statsDomId: '__rightClickOnWebStats'
};

let enabled = true;
let isActive = false;
let currentMode = SHARED.DEFAULT_MODE;
let currentPreset = SHARED.PRESET_SAFE;
let currentFeatures = SHARED.parseDomainSetting({
  enabled: true,
  preset: SHARED.PRESET_SAFE
}).features;
let eventController = null;
let observer = null;
let shadowObserverMap = new Map();
let knownShadowRoots = new Set();
let neutralizedOverlayStyles = new Map();
let rescanTimer = null;
let idleRescans = new Set();
let stats = createStats();

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

function createStats() {
  const result = {
    attributeRemovals: Object.fromEntries(
      RIGHT_CLICK_ON_WEB.blockedAttributes.map((name) => [name, 0])
    ),
    eventInterceptions: Object.fromEntries(
      Object.keys(EVENT_FEATURE_MAP).map((name) => [name, 0])
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
    mode: SHARED.DEFAULT_MODE,
    preset: currentPreset,
    features: { ...currentFeatures }
  };
  return result;
}

function resetStats() {
  stats = createStats();
  window.__rightClickOnWebStats = stats;
}

function readDiagnosticValue(source, key) {
  try {
    return source && typeof source === 'object' ? source[key] : undefined;
  } catch (_) {
    return undefined;
  }
}

function copyDiagnosticCounters(source, keys) {
  const result = {};
  for (const key of keys) {
    const value = readDiagnosticValue(source, key);
    result[key] = Number.isInteger(value) && value >= 0 ? value : 0;
  }
  return result;
}

function copyDiagnosticFeatures(source) {
  const result = {};
  const features = readDiagnosticValue(source, 'features');
  for (const key of SHARED.FEATURE_KEYS) {
    result[key] = readDiagnosticValue(features, key) === true;
  }
  return result;
}

function sanitizeDiagnosticStats(source) {
  const resolveSource = readDiagnosticValue(source, 'resolveSource');
  const mode = readDiagnosticValue(source, 'mode');
  const preset = readDiagnosticValue(source, 'preset');
  const matchedDomain = readDiagnosticValue(source, 'matchedDomain');
  return {
    attributeRemovals: copyDiagnosticCounters(readDiagnosticValue(source, 'attributeRemovals'), DIAGNOSTIC_ATTRIBUTE_COUNTER_KEYS),
    eventInterceptions: copyDiagnosticCounters(readDiagnosticValue(source, 'eventInterceptions'), DIAGNOSTIC_EVENT_COUNTER_KEYS),
    overlaysNeutralized: copyDiagnosticCounters(source, ['overlaysNeutralized']).overlaysNeutralized,
    shadowRootsScanned: copyDiagnosticCounters(source, ['shadowRootsScanned']).shadowRootsScanned,
    periodicRescans: copyDiagnosticCounters(source, ['periodicRescans']).periodicRescans,
    resolveSource: DIAGNOSTIC_SOURCES.includes(resolveSource) ? resolveSource : 'unknown',
    matchedDomain: typeof matchedDomain === 'string'
      && DIAGNOSTIC_HOSTNAME_PATTERN.test(matchedDomain)
      && !matchedDomain.includes('..')
      ? matchedDomain
      : null,
    mode: mode === SHARED.MODE_LITE || mode === SHARED.MODE_ULTIMATE ? mode : 'unknown',
    preset: SHARED.VALID_PRESETS.includes(preset) ? preset : 'unknown',
    features: copyDiagnosticFeatures(source)
  };
}

function readDiagnosticStatsBridge() {
  const current = (typeof stats === 'object' && stats !== null && !Array.isArray(stats))
    ? stats
    : (typeof window.__rightClickOnWebStats === 'object' && window.__rightClickOnWebStats !== null && !Array.isArray(window.__rightClickOnWebStats))
      ? window.__rightClickOnWebStats
      : null;

  if (!current) {
    return {
      ok: false,
      reason: '현재 탭에서 진단 브리지를 찾을 수 없습니다. 페이지를 새로고침한 뒤 다시 시도하세요.'
    };
  }

  try {
    const snapshot = JSON.parse(JSON.stringify(current));
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      return {
        ok: false,
        reason: '진단 브리지 형식이 올바르지 않습니다. 페이지를 새로고침한 뒤 다시 시도하세요.'
      };
    }
    return { ok: true, stats: sanitizeDiagnosticStats(snapshot) };
  } catch (_) {
    return {
      ok: false,
      reason: '진단 브리지를 읽을 수 없습니다. 페이지를 새로고침한 뒤 다시 시도하세요.'
    };
  }
}

function handleDiagnosticStatsMessage(message) {
  if (!message || message.type !== 'rcow:readDiagnosticStats') {
    return null;
  }
  return readDiagnosticStatsBridge();
}

function bumpAttributeRemoval(attribute) {
  const counter = stats.attributeRemovals[attribute];
  if (typeof counter === 'number') {
    stats.attributeRemovals[attribute] = counter + 1;
  }
}

function bumpEventInterception(eventName) {
  const counter = stats.eventInterceptions[eventName];
  if (typeof counter === 'number') {
    stats.eventInterceptions[eventName] = counter + 1;
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

function buildUnlockerCss(features = currentFeatures) {
  const rules = [];
  if (features.ultimateCss && features.selection) {
    rules.push(`
      *:not(input):not(textarea),
      *:not(input):not(textarea)::before,
      *:not(input):not(textarea)::after {
        -webkit-user-select: text !important;
        -moz-user-select: text !important;
        -ms-user-select: text !important;
        user-select: text !important;
      }
      p, li, span, div, article, section, blockquote,
      h1, h2, h3, h4, h5, h6, td, th, pre, code, label {
        cursor: auto !important;
      }
    `);
  }
  if (features.ultimateCss && features.dragStart) {
    rules.push(`
      img, a {
        -webkit-user-drag: auto !important;
        -moz-user-drag: auto !important;
        user-drag: auto !important;
      }
    `);
  }
  if (features.ultimateCss && features.contextMenu) {
    rules.push(`
      *:not(input):not(textarea) {
        -webkit-touch-callout: default !important;
      }
    `);
  }
  if (features.ultimateCss && features.selection) {
    rules.push(`
      *:not(input):not(textarea)::selection {
        background-color: #3390ff !important;
        color: #ffffff !important;
      }
      *:not(input):not(textarea)::-moz-selection {
        background-color: #3390ff !important;
        color: #ffffff !important;
      }
    `);
  }
  if (features.printUnhide) {
    rules.push(`
      @media print {
        body * {
          display: revert !important;
          visibility: visible !important;
        }
      }
    `);
  }
  return rules.join('\n');
}

function injectSelectionStyle(root = document) {
  const css = buildUnlockerCss();
  if (!css || selectionStyleFor(root)) {
    return;
  }

  const style = document.createElement('style');
  style.id = RIGHT_CLICK_ON_WEB.styleId;
  style.setAttribute(RIGHT_CLICK_ON_WEB.markerAttribute, 'true');
  style.textContent = css;

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

const INTERACTIVE_OVERLAY_TAGS = new Set([
  'A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'IMG', 'PICTURE', 'VIDEO',
  'AUDIO', 'CANVAS', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'SUMMARY', 'LABEL'
]);
const INTERACTIVE_OVERLAY_ROLES = new Set(['button', 'dialog', 'link', 'menuitem', 'option', 'tab']);
const COMPUTED_OVERLAY_MIN_COVER_RATIO = 0.5;

function isInteractiveOverlayNode(element) {
  if (INTERACTIVE_OVERLAY_TAGS.has(element.tagName)) {
    return true;
  }
  if (element.isContentEditable) {
    return true;
  }
  try {
    if (element.getAttribute('tabindex') !== null) {
      return true;
    }
    const role = (element.getAttribute('role') || '').toLowerCase();
    return INTERACTIVE_OVERLAY_ROLES.has(role);
  } catch (_) {
    return false;
  }
}

function hasInteractiveOverlayContent(element) {
  if (typeof element.querySelectorAll !== 'function') {
    return false;
  }
  for (const descendant of element.querySelectorAll('*')) {
    if (isInteractiveOverlayNode(descendant)) {
      return true;
    }
  }
  return false;
}

function coversMajorViewport(element) {
  if (typeof element.getBoundingClientRect !== 'function') {
    return false;
  }
  const viewportWidth = typeof window !== 'undefined' && typeof window.innerWidth === 'number'
    ? window.innerWidth
    : 0;
  const viewportHeight = typeof window !== 'undefined' && typeof window.innerHeight === 'number'
    ? window.innerHeight
    : 0;
  if (!viewportWidth || !viewportHeight) {
    return false;
  }
  try {
    const rect = element.getBoundingClientRect();
    return (
      rect.width >= viewportWidth * COMPUTED_OVERLAY_MIN_COVER_RATIO &&
      rect.height >= viewportHeight * COMPUTED_OVERLAY_MIN_COVER_RATIO
    );
  } catch (_) {
    return false;
  }
}

function resolveOverlayPosition(element) {
  const inlinePosition = (element.style.position || '').toLowerCase().trim();
  if (inlinePosition === 'absolute' || inlinePosition === 'fixed') {
    return { position: inlinePosition, computed: false };
  }
  if (typeof getComputedStyle !== 'function') {
    return { position: inlinePosition, computed: false };
  }
  try {
    const computedPosition = (getComputedStyle(element).position || '').toLowerCase().trim();
    return {
      position: computedPosition,
      computed: computedPosition === 'absolute' || computedPosition === 'fixed'
    };
  } catch (_) {
    return { position: inlinePosition, computed: false };
  }
}

function neutralizeBlockOverlay(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const { position, computed } = resolveOverlayPosition(element);
  if (position !== 'absolute' && position !== 'fixed') {
    return false;
  }

  if ((element.textContent || '').trim().length > 0) {
    return false;
  }

  if (computed && !coversMajorViewport(element)) {
    return false;
  }

  if (hasInteractiveOverlayContent(element)) {
    return false;
  }

  if (!neutralizedOverlayStyles.has(element)) {
    neutralizedOverlayStyles.set(element, {
      value: element.style.getPropertyValue('pointer-events'),
      priority: element.style.getPropertyPriority('pointer-events')
    });
  }
  element.style.setProperty('pointer-events', 'none', 'important');
  return true;
}

function restoreNeutralizedOverlays() {
  for (const [element, previous] of neutralizedOverlayStyles) {
    if (previous.value) {
      element.style.setProperty('pointer-events', previous.value, previous.priority);
    } else {
      element.style.removeProperty('pointer-events');
    }
  }
  neutralizedOverlayStyles = new Map();
}

function isTraversableRoot(root) {
  return (
    root instanceof Document ||
    root instanceof Element ||
    root instanceof DocumentFragment ||
    (typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot)
  );
}

function activeBlockedAttributes() {
  return RIGHT_CLICK_ON_WEB.blockedAttributes.filter(
    (attribute) => currentFeatures[ATTRIBUTE_FEATURE_MAP[attribute]]
  );
}

function collectBlockingCandidates(root, attributes) {
  const selector = attributes.map((attribute) => `[${attribute}]`).join(',');
  const candidates = new Set();

  if (root instanceof Element && (currentFeatures.overlayCleanup || (selector && root.matches(selector)))) {
    candidates.add(root);
  }

  if (selector) {
    for (const element of root.querySelectorAll(selector)) {
      candidates.add(element);
    }
  }
  if (currentFeatures.overlayCleanup) {
    for (const element of root.querySelectorAll('*')) {
      candidates.add(element);
    }
  }

  return [...candidates];
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

  const attributes = activeBlockedAttributes();
  const candidates = collectBlockingCandidates(root, attributes);

  for (const element of candidates) {
    for (const attribute of attributes) {
      if (element.hasAttribute(attribute)) {
        element.removeAttribute(attribute);
        bumpAttributeRemoval(attribute);
      }
      clearLockedIdlAttribute(element, attribute);
    }
    if (currentFeatures.overlayCleanup && neutralizeBlockOverlay(element)) {
      stats.overlaysNeutralized += 1;
    }
  }

  if (!currentFeatures.shadowDom) {
    return;
  }

  for (const host of discoverShadowHosts(root)) {
    const shadow = host.shadowRoot;
    knownShadowRoots.add(shadow);
    injectSelectionStyle(shadow);
    if (shadowObserverMap.has(shadow)) {
      continue;
    }
    stats.shadowRootsScanned += 1;
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

  const attributes = activeBlockedAttributes();
  const observerOptions = {
    childList: true,
    subtree: true
  };
  if (attributes.length > 0) {
    observerOptions.attributes = true;
    observerOptions.attributeFilter = attributes;
  }
  observerInstance.observe(target, observerOptions);

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
    if (!currentFeatures[EVENT_FEATURE_MAP[eventName]]) {
      continue;
    }
    document.addEventListener(eventName, handleInterceptedEvent(eventName), {
      capture: true,
      passive: false,
      signal: eventController.signal
    });
  }

  if (currentFeatures.copyShortcuts) {
    document.addEventListener('keydown', (event) => {
      if (isEditableElement(event.target)) {
        return;
      }
      const isModifier = event.ctrlKey || event.metaKey;
      const keyCopy = ['c', 'a', 'x'].includes(event.key.toLowerCase());
      const keyInsertCopy = event.key === 'Insert' && (event.ctrlKey || event.metaKey);
      const keyInsertPaste = event.key === 'Insert' && event.shiftKey;
      if ((isModifier && keyCopy) || keyInsertCopy || keyInsertPaste) {
        bumpEventInterception('keydown');
        event.stopImmediatePropagation();
      }
    }, {
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
  let handle;
  handle = scheduleIdle(() => {
    idleRescans.delete(handle);
    if (isActive) {
      removeBlockingAttributes();
    }
  });
  idleRescans.add(handle);
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
  for (const handle of idleRescans) {
    if (typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(handle);
    } else {
      clearTimeout(handle);
    }
  }
  idleRescans.clear();
}

function enableUnlocker() {
  if (isActive) {
    return;
  }

  resetStats();
  injectSelectionStyles();
  addEventInterceptors();

  const hasDomCleanup = activeBlockedAttributes().length > 0
    || currentFeatures.overlayCleanup
    || currentFeatures.shadowDom;
  if (hasDomCleanup) {
    removeBlockingAttributes();
    observeBlockingChanges();
    startPeriodicRescan();
  }

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
  restoreNeutralizedOverlays();

  knownShadowRoots = new Set();

  isActive = false;
}

function profilesEqual(left, right) {
  return left.mode === right.mode
    && left.preset === right.preset
    && SHARED.FEATURE_KEYS.every((key) => left.features[key] === right.features[key]);
}

function setEnabled(nextEnabled, nextProfile) {
  const normalized = nextProfile
    && typeof nextProfile === 'object'
    && typeof nextProfile.enabled === 'boolean'
    && typeof nextProfile.preset === 'string'
    && nextProfile.features
      ? nextProfile
      : SHARED.parseDomainSetting({
          ...nextProfile,
          enabled: nextEnabled
        });
  const previousProfile = {
    mode: currentMode,
    preset: currentPreset,
    features: currentFeatures
  };
  const profileChanged = !profilesEqual(previousProfile, normalized);

  if (!isActive && eventController && profileChanged) {
    eventController.abort();
    eventController = null;
  }
  if (isActive && (!normalized.enabled || profileChanged)) {
    disableUnlocker();
  }

  enabled = normalized.enabled;
  currentMode = normalized.mode;
  currentPreset = normalized.preset;
  currentFeatures = normalized.features;

  if (enabled && !isActive) {
    enableUnlocker();
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
      source: 'opaque-origin-unresolved',
      hostname: '',
      matchedKey: null,
      ...SHARED.parseDomainSetting({ enabled: false, preset: SHARED.DEFAULT_PRESET })
    };
  }

  // 1) Session layer — temporary per-hostname override. Wins over
  //    everything because the user explicitly asked for "this session
  //    only" and that intent is narrower than the persistent domain
  //    setting. `true` = session ON override; `false` = session OFF
  //    override (temporary pause). Absent key falls through to domain.
  if (hostname && SHARED.isSessionStorageAvailable()) {
    const key = SHARED.sessionKeyFor(hostname);
    try {
      const sessionData = await SHARED.storageGet(chrome.storage.session, key);
      if (sessionData[key] === true) {
        return {
          source: 'session',
          hostname,
          matchedKey: null,
          ...SHARED.parseDomainSetting({ enabled: true, preset: SHARED.DEFAULT_PRESET })
        };
      }
      if (sessionData[key] === false) {
        return {
          source: 'session',
          hostname,
          matchedKey: null,
          ...SHARED.parseDomainSetting({ enabled: false, preset: SHARED.DEFAULT_PRESET })
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
      return {
        source: 'domain',
        hostname,
        matchedKey,
        ...SHARED.parseDomainSetting(entry)
      };
    }
  }

  return {
    source: hostname ? 'global' : 'global-no-host',
    hostname,
    matchedKey: null,
    ...SHARED.parseDomainSetting({
      enabled: globalEnabled,
      preset: SHARED.DEFAULT_PRESET
    })
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
      setEnabled(result.enabled, result);
      // Surface the decision on the public stats object so the
      // manual test page and any future debugging UI can show
      // *why* the unlocker is on or off.
      try {
        if (stats) {
          stats.resolveSource = result.source;
          stats.matchedDomain = result.matchedKey;
          stats.mode = result.mode || SHARED.DEFAULT_MODE;
          stats.preset = result.preset;
          stats.features = { ...result.features };
        }
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

// Clean up any legacy stats DOM element to prevent web editor leakage
try {
  document.getElementById(RIGHT_CLICK_ON_WEB.statsDomId)?.remove();
} catch (_) {
  // DOM not ready or restricted
}

// Cross-world QA event bridge — allows manual test pages to query stats on-demand
// without polluting the DOM tree or serializing scripts into web editors.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('rcow:requestStats', () => {
    try {
      window.dispatchEvent(new CustomEvent('rcow:responseStats', {
        detail: JSON.stringify(stats)
      }));
    } catch (_) {
      // Ignore cross-context dispatch errors
    }
  });
}

if (chrome.runtime && chrome.runtime.onMessage && typeof chrome.runtime.onMessage.addListener === 'function') {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const response = handleDiagnosticStatsMessage(message);
    if (response) {
      sendResponse(response);
      return;
    }
    if (message && message.type === 'rcow:getViewport') {
      sendResponse({
        ok: true,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          dpr: window.devicePixelRatio
        }
      });
    }
  });
}
