'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');
const overlaySource = fs.readFileSync(path.join(root, 'crop-overlay.js'), 'utf8');
const keyboardUtils = require(path.join(root, 'keyboard-utils.js'));

function createHarness(options = {}) {
  const documentListeners = new Map();
  const runtimeListeners = [];
  const sentMessages = [];

  class FakeClassList {
    constructor(element) {
      this.element = element;
    }

    add(name) {
      const names = new Set(this.element.className.split(/\s+/).filter(Boolean));
      names.add(name);
      this.element.className = [...names].join(' ');
    }

    contains(name) {
      return this.element.className.split(/\s+/).includes(name);
    }
  }

  class FakeElement {
    constructor(tagName, document) {
      this.tagName = tagName.toUpperCase();
      this.ownerDocument = document;
      this.parentNode = null;
      this.children = [];
      this.attributes = new Map();
      this.className = '';
      this.classList = new FakeClassList(this);
      this.style = {};
      this.textContent = '';
      this.isConnected = false;
      this.isContentEditable = false;
      this.disabled = false;
      this.focusCalls = [];
      this.listeners = new Map();
    }

    appendChild(child) {
      child.parentNode = this;
      child.isConnected = this.isConnected;
      this.children.push(child);
      return child;
    }

    insertBefore(child, reference) {
      const index = this.children.indexOf(reference);
      if (index === -1) return this.appendChild(child);
      child.parentNode = this;
      child.isConnected = this.isConnected;
      this.children.splice(index, 0, child);
      return child;
    }

    remove() {
      if (!this.parentNode) return;
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      this.parentNode = null;
      this.isConnected = false;
    }

    setAttribute(name, value) {
      this.attributes.set(name, String(value));
      if (name === 'class') this.className = String(value);
      if (name === 'contenteditable') this.isContentEditable = String(value) !== 'false';
    }

    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    }

    hasAttribute(name) {
      return this.attributes.has(name);
    }

    addEventListener(name, listener) {
      this.listeners.set(name, listener);
    }

    focus(options) {
      this.focusCalls.push(options);
      this.ownerDocument.activeElement = this;
    }

    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }

    querySelectorAll(selector) {
      const matches = [];
      const visit = (element) => {
        for (const child of element.children) {
          if (child.matches(selector)) matches.push(child);
          visit(child);
        }
      };
      visit(this);
      return matches;
    }

    matches(selector) {
      if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
      if (selector === '[aria-live]') return this.hasAttribute('aria-live');
      return this.tagName === selector.toUpperCase();
    }

    set innerHTML(value) {
      this.children = [];
      const spanPattern = /<span(?: class="([^"]+)")?(?: aria-live="([^"]+)")?(?: aria-atomic="([^"]+)")?>([\s\S]*?)<\/span>/g;
      for (const match of value.matchAll(spanPattern)) {
        const span = new FakeElement('span', this.ownerDocument);
        if (match[1]) span.className = match[1];
        if (match[2]) span.setAttribute('aria-live', match[2]);
        if (match[3]) span.setAttribute('aria-atomic', match[3]);
        span.textContent = match[4];
        this.appendChild(span);
      }
    }
  }

  const document = {
    activeElement: null,
    createElement(tagName) {
      return new FakeElement(tagName, document);
    },
    contains(element) {
      return Boolean(element?.isConnected);
    },
    addEventListener(name, listener) {
      documentListeners.set(name, listener);
    },
    removeEventListener(name, listener) {
      if (documentListeners.get(name) === listener) documentListeners.delete(name);
    },
    querySelectorAll(selector) {
      return document.documentElement.querySelectorAll(selector);
    },
    execCommand() {
      return true;
    }
  };

  document.documentElement = new FakeElement('html', document);
  document.documentElement.isConnected = true;
  document.body = new FakeElement('body', document);
  document.documentElement.appendChild(document.body);
  document.activeElement = options.activeElement || document.body;

  const window = {
    innerWidth: 100,
    innerHeight: 80,
    devicePixelRatio: 2
  };

  const chrome = {
    runtime: {
      onMessage: {
        addListener(listener) {
          runtimeListeners.push(listener);
        }
      },
      async sendMessage(message) {
        sentMessages.push(message);
        return { ok: true, text: '테스트' };
      }
    }
  };

  const context = vm.createContext({
    chrome,
    console,
    document,
    globalThis: null,
    navigator: { clipboard: { async writeText() {} } },
    Promise,
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
    window
  });
  context.globalThis = context;
  if (Object.hasOwn(options, 'keyboardUtils')) {
    context.RIGHT_CLICK_ON_WEB_KEYBOARD_UTILS = options.keyboardUtils;
  } else {
    context.RIGHT_CLICK_ON_WEB_KEYBOARD_UTILS = keyboardUtils;
  }
  vm.runInContext(overlaySource, context, { filename: 'crop-overlay.js' });

  function startCrop() {
    let response;
    runtimeListeners[0]({ type: 'rcow:startCrop' }, {}, (value) => {
      response = value;
    });
    return response;
  }

  function keydown(key, extra = {}) {
    const event = {
      key,
      shiftKey: false,
      preventDefault() {},
      stopImmediatePropagation() {},
      ...extra
    };
    documentListeners.get('keydown')?.(event);
  }

  return {
    context,
    document,
    keydown,
    sentMessages,
    startCrop
  };
}

test('missing or malformed keyboard utils reports a Korean error without throwing', () => {
  for (const malformed of [undefined, {}]) {
    const harness = createHarness({ keyboardUtils: malformed });

    assert.doesNotThrow(() => harness.startCrop());
    const toast = harness.document.querySelectorAll('.rcow-toast').at(-1);
    assert.ok(toast);
    assert.match(toast.children.at(-1).textContent, /키보드|영역 선택|불러오/);
    assert.equal(toast.classList.contains('is-error'), true);
    assert.equal(harness.document.querySelectorAll('.rcow-crop-overlay').length, 0);

    harness.context.RIGHT_CLICK_ON_WEB_KEYBOARD_UTILS = keyboardUtils;
    assert.doesNotThrow(() => harness.startCrop());
    assert.equal(harness.document.querySelectorAll('.rcow-crop-overlay').length, 1);
  }

  const activeHarness = createHarness();
  activeHarness.startCrop();
  delete activeHarness.context.RIGHT_CLICK_ON_WEB_KEYBOARD_UTILS;

  assert.doesNotThrow(() => activeHarness.keydown('Enter'));
  const liveStatus = activeHarness.document.querySelectorAll('.rcow-sr-instruction')[0];
  assert.match(liveStatus.textContent, /불러오지 못했습니다/);
  assert.equal(activeHarness.sentMessages.length, 0);
});

test('Enter validates and submits the clamped keyboard rectangle', async () => {
  const recoverable = { x: -5, y: -4, width: 40, height: 30 };
  const harness = createHarness({
    keyboardUtils: {
      ...keyboardUtils,
      initCropKeyboard() {
        return recoverable;
      }
    }
  });

  harness.startCrop();
  harness.keydown('Enter');
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.sentMessages.length, 1);
  assert.deepEqual({ ...harness.sentMessages[0].cropRect }, {
    x: 0,
    y: 0,
    width: 35,
    height: 26
  });
});

test('only the screen-reader instruction span is a polite atomic live region', () => {
  const harness = createHarness();

  harness.startCrop();

  const liveRegions = harness.document.querySelectorAll('[aria-live]');
  assert.equal(liveRegions.length, 1);
  assert.equal(liveRegions[0].classList.contains('rcow-sr-instruction'), true);
  assert.equal(liveRegions[0].getAttribute('aria-live'), 'polite');
  assert.equal(liveRegions[0].getAttribute('aria-atomic'), 'true');
  const tip = harness.document.querySelectorAll('.rcow-crop-tip')[0];
  assert.equal(tip.hasAttribute('aria-live'), false);
  assert.equal(tip.hasAttribute('aria-atomic'), false);
});

test('cleanup restores only meaningful focus without scrolling', () => {
  const buttonHarness = createHarness();
  const button = buttonHarness.document.createElement('button');
  buttonHarness.document.body.appendChild(button);
  buttonHarness.document.activeElement = button;

  buttonHarness.startCrop();
  buttonHarness.keydown('Escape');
  assert.deepEqual(button.focusCalls.map((options) => ({ ...options })), [{ preventScroll: true }]);

  const bodyHarness = createHarness();
  const body = bodyHarness.document.body;
  bodyHarness.startCrop();
  bodyHarness.keydown('Escape');
  assert.equal(body.focusCalls.length, 0);

  const htmlHarness = createHarness({ activeElement: null });
  const html = htmlHarness.document.documentElement;
  htmlHarness.document.activeElement = html;
  htmlHarness.startCrop();
  htmlHarness.keydown('Escape');
  assert.equal(html.focusCalls.length, 0);

  const disconnectedHarness = createHarness();
  const disconnectedButton = disconnectedHarness.document.createElement('button');
  disconnectedHarness.document.activeElement = disconnectedButton;
  disconnectedHarness.startCrop();
  disconnectedHarness.keydown('Escape');
  assert.equal(disconnectedButton.focusCalls.length, 0);
});
