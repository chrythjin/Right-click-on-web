'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');

class FakeStyle {
  constructor() {
    this.values = new Map();
  }

  setProperty(name, value, priority = '') {
    this.values.set(name, { value, priority });
  }

  getPropertyValue(name) {
    return this.values.get(name)?.value || '';
  }

  getPropertyPriority(name) {
    return this.values.get(name)?.priority || '';
  }

  removeProperty(name) {
    this.values.delete(name);
  }
}

function createHarness(initialSync = { enabled: false, domainSettings: {} }) {
  const storageListeners = [];
  const listeners = [];
  const observers = [];
  const intervals = new Map();
  let nextInterval = 1;

  class FakeNode {}
  class FakeElement extends FakeNode {
    constructor(tagName = 'div') {
      super();
      this.tagName = tagName.toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.ownerDocument = null;
      this.attributes = new Map();
      this.style = new FakeStyle();
      this.textContent = '';
      this.id = '';
      this.className = '';
      this.isContentEditable = false;
      this.isConnected = true;
      this.shadowRoot = null;
    }

    appendChild(child) {
      child.parentNode = this;
      child.ownerDocument = this.ownerDocument;
      this.children.push(child);
      return child;
    }

    remove() {
      if (this.parentNode) {
        this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
        this.parentNode = null;
      }
    }

    setAttribute(name, value) {
      this.attributes.set(name, String(value));
      if (name === 'id') {
        this.id = String(value);
      }
    }

    hasAttribute(name) {
      return this.attributes.has(name);
    }

    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    }

    removeAttribute(name) {
      this.attributes.delete(name);
    }

    matches(selector) {
      return selector.split(',').some((part) => {
        const match = part.trim().match(/^\[([^\]]+)\]$/);
        return match ? this.hasAttribute(match[1]) : false;
      });
    }

    closest(selector) {
      if (selector === 'input, textarea, select') {
        let current = this;
        while (current) {
          if (['INPUT', 'TEXTAREA', 'SELECT'].includes(current.tagName)) {
            return current;
          }
          current = current.parentNode;
        }
      }
      return null;
    }

    querySelectorAll(selector) {
      const descendants = [];
      const visit = (node) => {
        for (const child of node.children) {
          if (selector === '*' || child.matches(selector)) {
            descendants.push(child);
          }
          visit(child);
        }
      };
      visit(this);
      return descendants;
    }

    querySelector(selector) {
      if (selector.startsWith('#')) {
        return this.querySelectorAll('*').find((element) => element.id === selector.slice(1)) || null;
      }
      return this.querySelectorAll(selector)[0] || null;
    }
  }

  class FakeHTMLElement extends FakeElement {}
  class FakeDocumentFragment extends FakeNode {
    constructor() {
      super();
      this.children = [];
      this.host = null;
    }

    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }

    querySelectorAll(selector) {
      const holder = new FakeElement();
      holder.children = this.children;
      return holder.querySelectorAll(selector);
    }

    querySelector(selector) {
      if (selector.startsWith('#')) {
        return this.querySelectorAll('*').find((element) => element.id === selector.slice(1)) || null;
      }
      return this.querySelectorAll(selector)[0] || null;
    }
  }
  class FakeShadowRoot extends FakeDocumentFragment {}
  class FakeDocument extends FakeNode {}

  const documentElement = new FakeHTMLElement('html');
  const head = new FakeHTMLElement('head');
  const body = new FakeHTMLElement('body');
  documentElement.appendChild(head);
  documentElement.appendChild(body);

  const document = Object.assign(new FakeDocument(), {
    documentElement,
    head,
    body,
    visibilityState: 'visible',
    referrer: '',
    createElement(tagName) {
      const element = new FakeHTMLElement(tagName);
      element.ownerDocument = document;
      return element;
    },
    getElementById(id) {
      return [documentElement, ...documentElement.querySelectorAll('*')]
        .find((element) => element.id === id) || null;
    },
    querySelectorAll(selector) {
      return documentElement.querySelectorAll(selector);
    },
    querySelector(selector) {
      return documentElement.querySelector(selector);
    },
    createTreeWalker(rootNode) {
      const nodes = rootNode.querySelectorAll ? rootNode.querySelectorAll('*') : [];
      let index = 0;
      return { nextNode: () => nodes[index++] || null };
    },
    addEventListener(name, listener, options = {}) {
      listeners.push({ name, listener, signal: options.signal || null });
    }
  });
  documentElement.ownerDocument = document;
  head.ownerDocument = document;
  body.ownerDocument = document;

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.connected = false;
      observers.push(this);
    }

    observe() {
      this.connected = true;
    }

    disconnect() {
      this.connected = false;
    }
  }

  const window = {
    location: {
      href: 'https://unit.example/page',
      protocol: 'https:',
      ancestorOrigins: []
    },
    addEventListener() {},
    requestIdleCallback(callback) {
      callback();
      return 1;
    },
    cancelIdleCallback() {}
  };
  window.getComputedStyle = (element) => ({
    position: element.computedPosition || 'static',
    zIndex: element.computedZIndex || 'auto'
  });
  window.top = window;
  window.parent = window;

  function storageArea(data) {
    return {
      get(keys, callback) {
        const defaults = keys && typeof keys === 'object' && !Array.isArray(keys) ? keys : {};
        const names = typeof keys === 'string' ? [keys] : Object.keys(defaults);
        const result = { ...defaults };
        for (const name of names) {
          if (Object.hasOwn(data, name)) {
            result[name] = data[name];
          }
        }
        callback(result);
      },
      set(update, callback) {
        Object.assign(data, update);
        callback?.();
      }
    };
  }

  const syncData = structuredClone(initialSync);
  const chrome = {
    runtime: { lastError: null },
    storage: {
      sync: storageArea(syncData),
      local: storageArea({}),
      session: storageArea({}),
      onChanged: {
        addListener(listener) {
          storageListeners.push(listener);
        }
      }
    }
  };

  const context = vm.createContext({
    AbortController,
    chrome,
    console,
    document,
    Document: FakeDocument,
    DocumentFragment: FakeDocumentFragment,
    Element: FakeElement,
    HTMLElement: FakeHTMLElement,
    MutationObserver: FakeMutationObserver,
    Node: FakeNode,
    NodeFilter: { SHOW_ELEMENT: 1 },
    Promise,
    queueMicrotask,
    ShadowRoot: FakeShadowRoot,
    setInterval(callback) {
      const id = nextInterval++;
      intervals.set(id, callback);
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    setTimeout(callback) {
      callback();
      return 1;
    },
    clearTimeout() {},
    URL,
    window
  });
  context.getComputedStyle = window.getComputedStyle;

  for (const file of ['shared.js', 'content.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }

  function run(source) {
    return vm.runInContext(source, context);
  }

  function applyProfile(setting, enabled = true) {
    const serialized = JSON.stringify(setting);
    run(`setEnabled(${enabled}, RIGHT_CLICK_ON_WEB_SHARED.parseDomainSetting(${serialized}))`);
  }

  function activeEventNames() {
    return listeners
      .filter(({ signal }) => !signal?.aborted)
      .map(({ name }) => name)
      .sort();
  }

  return {
    activeEventNames,
    applyProfile,
    body,
    context,
    document,
    intervals,
    listeners,
    observers,
    run,
    syncData,
    window
  };
}

const PROFILE_EVENTS = {
  safe: ['contextmenu', 'copy', 'cut', 'keydown', 'mousedown', 'mouseup', 'paste', 'selectstart'],
  selection: ['copy', 'cut', 'keydown', 'paste', 'selectstart'],
  complete: ['contextmenu', 'copy', 'cut', 'dragover', 'dragstart', 'drop', 'keydown', 'mousedown', 'mouseup', 'paste', 'selectstart'],
  'upload-safe': ['contextmenu', 'copy', 'cut', 'dragstart', 'keydown', 'mousedown', 'mouseup', 'paste', 'selectstart'],
  'media-safe': ['contextmenu', 'copy', 'cut', 'keydown', 'mousedown', 'mouseup', 'paste', 'selectstart']
};

for (const [preset, expectedEvents] of Object.entries(PROFILE_EVENTS)) {
  test(`${preset} profile gates ISOLATED event listeners and CSS`, () => {
    const harness = createHarness();
    harness.applyProfile({ enabled: true, preset });

    assert.deepEqual(harness.activeEventNames(), expectedEvents);
    const css = harness.document.getElementById('right-click-on-web-style')?.textContent || '';
    assert.equal(css.includes('@media print'), ['selection', 'complete', 'upload-safe'].includes(preset));
    assert.equal(css.includes('user-drag: auto'), ['complete', 'upload-safe'].includes(preset));
  });
}

test('custom profile independently gates events, CSS, and inline attributes', () => {
  const harness = createHarness();
  const blocked = harness.document.createElement('div');
  for (const attribute of ['oncontextmenu', 'oncopy', 'ondragstart', 'ondragover', 'ondrop']) {
    blocked.setAttribute(attribute, 'return false');
  }
  harness.body.appendChild(blocked);

  harness.applyProfile({
    enabled: true,
    preset: 'custom',
    features: {
      contextMenu: false,
      selection: false,
      copyShortcuts: false,
      dragStart: true,
      dragDrop: false,
      overlayCleanup: false,
      printUnhide: false,
      shadowDom: false,
      ultimateCss: true
    }
  });

  assert.deepEqual(harness.activeEventNames(), ['dragstart']);
  assert.equal(blocked.hasAttribute('oncontextmenu'), true);
  assert.equal(blocked.hasAttribute('oncopy'), true);
  assert.equal(blocked.hasAttribute('ondragstart'), false);
  assert.equal(blocked.hasAttribute('ondragover'), true);
  assert.equal(blocked.hasAttribute('ondrop'), true);
  assert.match(harness.document.getElementById('right-click-on-web-style').textContent, /user-drag: auto/);
});

test('dragDrop:false never installs dragover or drop interceptors and preserves normal mouse input', () => {
  const harness = createHarness();
  harness.applyProfile({ enabled: true, preset: 'upload-safe' });

  assert.equal(harness.activeEventNames().includes('dragover'), false);
  assert.equal(harness.activeEventNames().includes('drop'), false);

  const mouseDown = harness.listeners.find(({ name, signal }) => name === 'mousedown' && !signal.aborted);
  for (const button of [0, 1]) {
    let stopped = false;
    mouseDown.listener({
      button,
      target: harness.body,
      stopImmediatePropagation() { stopped = true; }
    });
    assert.equal(stopped, false);
  }
});

test('overlay cleanup is gated and restored when the profile changes', () => {
  const harness = createHarness();
  const overlay = harness.document.createElement('div');
  overlay.ownerDocument = harness.document;
  overlay.style.position = 'fixed';
  harness.body.appendChild(overlay);

  harness.applyProfile({ enabled: true, preset: 'safe' });
  assert.equal(overlay.style.getPropertyValue('pointer-events'), '');

  harness.applyProfile({
    enabled: true,
    preset: 'custom',
    features: { overlayCleanup: true }
  });
  assert.equal(overlay.style.getPropertyValue('pointer-events'), 'none');
  assert.equal(overlay.style.getPropertyPriority('pointer-events'), 'important');

  harness.applyProfile({ enabled: true, preset: 'safe' });
  assert.equal(overlay.style.getPropertyValue('pointer-events'), '');
});

test('Shadow DOM traversal and CSS injection follow the shadowDom feature', () => {
  const harness = createHarness();
  const host = harness.document.createElement('section');
  const shadow = new harness.context.ShadowRoot();
  shadow.host = host;
  host.shadowRoot = shadow;
  harness.body.appendChild(host);

  harness.applyProfile({ enabled: true, preset: 'selection' });
  assert.equal(shadow.querySelector('#right-click-on-web-style'), null);

  harness.applyProfile({ enabled: true, preset: 'complete' });
  assert.notEqual(shadow.querySelector('#right-click-on-web-style'), null);
});

test('profile switches fully tear down and idempotently reapply resources', () => {
  const harness = createHarness();
  harness.applyProfile({ enabled: true, preset: 'complete' });
  const firstActiveListeners = harness.activeEventNames().length;

  harness.applyProfile({ enabled: true, preset: 'complete' });
  assert.equal(harness.activeEventNames().length, firstActiveListeners);
  assert.equal(harness.intervals.size, 1);
  assert.equal(harness.observers.filter((observer) => observer.connected).length, 1);

  harness.applyProfile({ enabled: true, preset: 'selection' });
  assert.deepEqual(harness.activeEventNames(), PROFILE_EVENTS.selection);
  assert.equal(harness.intervals.size, 1);
  assert.equal(harness.observers.filter((observer) => observer.connected).length, 1);
  assert.equal(harness.document.getElementById('right-click-on-web-style') !== null, true);

  harness.run('setEnabled(false, RIGHT_CLICK_ON_WEB_SHARED.parseDomainSetting(false))');
  assert.deepEqual(harness.activeEventNames(), []);
  assert.equal(harness.intervals.size, 0);
  assert.equal(harness.observers.filter((observer) => observer.connected).length, 0);
  assert.equal(harness.document.getElementById('right-click-on-web-style'), null);
});

test('printUnhide remains independent when ultimateCss is disabled', () => {
  const harness = createHarness();
  harness.applyProfile({
    enabled: true,
    preset: 'custom',
    features: {
      printUnhide: true,
      ultimateCss: false
    }
  });

  const css = harness.document.getElementById('right-click-on-web-style').textContent;
  assert.match(css, /@media print/);
  assert.doesNotMatch(css, /user-select/);
});
