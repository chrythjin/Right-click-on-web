const RIGHT_CLICK_ON_WEB = {
  styleId: 'right-click-on-web-style',
  markerAttribute: 'data-right-click-on-web',
  blockedAttributes: [
    'oncontextmenu',
    'onselectstart',
    'oncopy',
    'oncut',
    'onpaste',
    'ondragstart',
    'onmousedown',
    'onmouseup'
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
    'mouseup',
    'touchstart',
    'touchend',
    'touchmove'
  ],
  // Periodic re-scan interval (ms). Catches anything MutationObserver
  // missed, e.g. attributeFilter-blind mutations on detached subtrees
  // that get re-attached. Paused while the tab is hidden.
  rescanIntervalMs: 2000
};

let enabled = true;
let isActive = false;
let eventController = null;
let observer = null;
let shadowObservers = [];
let observedShadowRoots = new WeakSet();
let rescanTimer = null;
let stats = createStats();

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
    periodicRescans: 0
  };
  return result;
}

function resetStats() {
  stats = createStats();
  window.__rightClickOnWebStats = stats;
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

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'));
}

function handleInterceptedEvent(eventName) {
  return (event) => {
    if (isEditableElement(event.target)) {
      return;
    }
    bumpEventInterception(eventName);
    event.stopImmediatePropagation();
  };
}

function injectSelectionStyle() {
  if (document.getElementById(RIGHT_CLICK_ON_WEB.styleId)) {
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

  const parent = document.head || document.documentElement;
  parent.appendChild(style);
}

function removeSelectionStyle() {
  document.getElementById(RIGHT_CLICK_ON_WEB.styleId)?.remove();
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
    }
  }

  for (const host of discoverShadowHosts(root)) {
    const shadow = host.shadowRoot;
    if (observedShadowRoots.has(shadow)) {
      continue;
    }
    observedShadowRoots.add(shadow);
    stats.shadowRootsScanned += 1;
    const observerInstance = attachMutationObserver(shadow);
    if (observerInstance) {
      shadowObservers.push(observerInstance);
    }
    removeBlockingAttributes(shadow);
  }
}

function pruneShadowObserver(observerToPrune) {
  const index = shadowObservers.indexOf(observerToPrune);
  if (index !== -1) {
    shadowObservers.splice(index, 1);
  }
}

function attachMutationObserver(root) {
  if (!isTraversableRoot(root)) {
    return null;
  }

  const target = root === document ? (document.documentElement || document) : root;

  const observerInstance = new MutationObserver((mutations) => {
    if (root !== document && target instanceof Element && !target.isConnected) {
      observerInstance.disconnect();
      pruneShadowObserver(observerInstance);
      return;
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
  injectSelectionStyle();
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

  for (const observerInstance of shadowObservers) {
    observerInstance.disconnect();
  }
  shadowObservers = [];

  observedShadowRoots = new WeakSet();

  stopPeriodicRescan();
  removeSelectionStyle();

  isActive = false;
}

function setEnabled(nextEnabled) {
  enabled = nextEnabled;

  if (enabled) {
    enableUnlocker();
  } else {
    disableUnlocker();
  }
}

chrome.storage.local.get({ enabled: true }, (settings) => {
  setEnabled(settings.enabled !== false);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes.enabled) {
    return;
  }

  setEnabled(changes.enabled.newValue !== false);
});
