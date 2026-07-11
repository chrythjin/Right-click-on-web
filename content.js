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
  ]
};

let enabled = true;
let eventController = null;
let observer = null;
let stats = createStats();

function createStats() {
  const result = {
    attributeRemovals: Object.fromEntries(
      RIGHT_CLICK_ON_WEB.blockedAttributes.map((name) => [name, 0])
    ),
    eventInterceptions: Object.fromEntries(
      RIGHT_CLICK_ON_WEB.blockedEvents.map((name) => [name, 0])
    ),
    overlaysNeutralized: 0
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

function removeBlockingAttributes(root = document) {
  if (!(root instanceof Document || root instanceof Element || root instanceof DocumentFragment)) {
    return;
  }

  const selector = RIGHT_CLICK_ON_WEB.blockedAttributes.map((attribute) => `[${attribute}]`).join(',');
  const candidates = [];

  if (root instanceof Element && root.matches(selector)) {
    candidates.push(root);
  }

  candidates.push(...root.querySelectorAll(selector));

  for (const element of candidates) {
    for (const attribute of RIGHT_CLICK_ON_WEB.blockedAttributes) {
      if (element.hasAttribute(attribute)) {
        element.removeAttribute(attribute);
        bumpAttributeRemoval(attribute);
      }
    }
    if (neutralizeBlockOverlay(element)) {
      stats.overlaysNeutralized += 1;
    }
  }
}

function observeBlockingChanges() {
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.target instanceof Element) {
        removeBlockingAttributes(mutation.target);
      }

      for (const node of mutation.addedNodes) {
        if (node instanceof Element || node instanceof DocumentFragment) {
          removeBlockingAttributes(node);
        }
      }
    }
  });

  observer.observe(document.documentElement || document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: RIGHT_CLICK_ON_WEB.blockedAttributes
  });
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

function enableUnlocker() {
  if (eventController || observer) {
    return;
  }

  resetStats();
  injectSelectionStyle();
  removeBlockingAttributes();
  addEventInterceptors();
  observeBlockingChanges();
}

function disableUnlocker() {
  eventController?.abort();
  eventController = null;

  observer?.disconnect();
  observer = null;

  removeSelectionStyle();
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
