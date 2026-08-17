'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');

function loadShared() {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, 'shared.js'), 'utf8'), context, { filename: 'shared.js' });
  return context.RIGHT_CLICK_ON_WEB_SHARED;
}

function loadDiagnosticHelpers() {
  const source = fs.readFileSync(path.join(root, 'popup.js'), 'utf8');
  const start = source.indexOf('const DIAGNOSTIC_ATTRIBUTE_COUNTER_KEYS');
  const end = source.indexOf('async function handleGlobalToggle', start);
  if (start < 0 || end < 0) {
    throw new Error('popup diagnostic report helpers not found');
  }
  const context = vm.createContext({ Object, JSON, Number, Array, RegExp, Math });
  vm.runInContext(`${source.slice(start, end)}; this.helpers = {
    requestDiagnosticBridge,
    copyAllowedCounters,
    serializeDiagnosticReport,
    copyDiagnosticReport
  };`, context, { filename: 'popup.js' });
  return context.helpers;
}

function loadContentDiagnosticHandler(textContent) {
  const source = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
  const start = source.indexOf('function readDiagnosticStatsBridge');
  const end = source.indexOf('function bumpAttributeRemoval', start);
  if (start < 0 || end < 0) {
    throw new Error('content diagnostic bridge handler not found');
  }
  let parsedStats = textContent;
  if (typeof textContent === 'string') {
    try {
      parsedStats = JSON.parse(textContent);
    } catch (_) {
      parsedStats = null;
    }
  }
  const context = vm.createContext({
    JSON,
    Array,
    stats: parsedStats,
    window: { __rightClickOnWebStats: parsedStats },
    RIGHT_CLICK_ON_WEB: { statsDomId: '__rightClickOnWebStats' }
  });
  vm.runInContext(`${source.slice(start, end)}; this.handle = handleDiagnosticStatsMessage;`, context, {
    filename: 'content.js'
  });
  return context.handle;
}

const SHARED = loadShared();
const helpers = loadDiagnosticHelpers();

function makeStats(overrides = {}) {
  return {
    resolveSource: 'domain',
    mode: 'ultimate',
    preset: 'custom',
    features: {
      contextMenu: true,
      selection: false,
      copyShortcuts: true,
      dragStart: false,
      dragDrop: true,
      overlayCleanup: false,
      printUnhide: true,
      shadowDom: true,
      ultimateCss: true,
      unexpectedFeature: true
    },
    attributeRemovals: { oncontextmenu: 2, oncopy: 1, secretAttribute: 99 },
    eventInterceptions: { contextmenu: 3, keydown: 4, privateEvent: 88 },
    overlaysNeutralized: 5,
    shadowRootsScanned: 6,
    periodicRescans: 7,
    ...overrides
  };
}

test('product serializer emits only the privacy-safe allowlisted report shape', () => {
  const report = helpers.serializeDiagnosticReport({
    version: '0.9.1',
    hostname: 'support.example.com',
    matchedDomain: 'example.com',
    stats: makeStats({
      pageText: 'private page text',
      ocrText: 'private OCR result',
      url: 'https://support.example.com/private/path?token=secret',
      nested: { clipboardContents: 'private clipboard' }
    })
  }, SHARED);

  assert.deepEqual(Object.keys(report), [
    'version', 'hostname', 'resolutionSource', 'matchedDomain', 'mode', 'preset', 'enabledFeatures', 'counters'
  ]);
  assert.deepEqual(Array.from(report.enabledFeatures), [
    'contextMenu', 'copyShortcuts', 'dragDrop', 'printUnhide', 'shadowDom', 'ultimateCss'
  ]);
  assert.deepEqual(Array.from(Object.keys(report.counters)), [
    'attributeRemovals', 'eventInterceptions', 'overlaysNeutralized', 'shadowRootsScanned', 'periodicRescans'
  ]);
  assert.equal(report.counters.attributeRemovals.oncontextmenu, 2);
  assert.equal(Object.hasOwn(report.counters.attributeRemovals, 'secretAttribute'), false);
  assert.equal(report.counters.eventInterceptions.contextmenu, 3);
  assert.equal(Object.hasOwn(report.counters.eventInterceptions, 'privateEvent'), false);
  assert.match(JSON.stringify(report), /support\.example\.com/);
});

test('product serializer excludes path, query, OCR, page, clipboard, and unknown bridge data', () => {
  const prohibited = [
    'private page text', 'private OCR result', '/private/path', 'token=secret', 'private clipboard',
    'unexpectedFeature', 'secretAttribute', 'privateEvent'
  ];
  const report = helpers.serializeDiagnosticReport({
    version: '0.9.1',
    hostname: 'support.example.com/private/path?token=secret',
    matchedDomain: 'example.com/path',
    stats: makeStats({
      pageText: 'private page text',
      ocrText: 'private OCR result',
      url: 'https://support.example.com/private/path?token=secret',
      nested: { clipboardContents: 'private clipboard' }
    })
  }, SHARED);
  const serialized = JSON.stringify(report);

  assert.equal(report.hostname, null);
  assert.equal(report.matchedDomain, null);
  for (const value of prohibited) {
    assert.equal(serialized.includes(value), false, `${value} must not be exposed`);
  }
});

test('product serializer normalizes feature order and untrusted counter values', () => {
  const report = helpers.serializeDiagnosticReport({
    version: 123,
    hostname: 'example.com',
    matchedDomain: 'example.com',
    stats: makeStats({
      resolveSource: 'unknown-source',
      mode: 'unknown-mode',
      preset: 'unknown-preset',
      features: { ultimateCss: true, contextMenu: true, nested: { leak: true } },
      attributeRemovals: { oncontextmenu: -1, oncopy: 1.9, oncut: '2' },
      eventInterceptions: { contextmenu: Infinity, keydown: 2.8 }
    })
  }, SHARED);

  assert.equal(report.version, 'unknown');
  assert.equal(report.resolutionSource, 'unknown');
  assert.equal(report.mode, 'unknown');
  assert.equal(report.preset, 'unknown');
  assert.deepEqual(Array.from(report.enabledFeatures), ['contextMenu', 'ultimateCss']);
  assert.equal(report.counters.attributeRemovals.oncontextmenu, 0);
  assert.equal(report.counters.attributeRemovals.oncopy, 1);
  assert.equal(report.counters.attributeRemovals.oncut, 0);
  assert.equal(report.counters.eventInterceptions.contextmenu, 0);
  assert.equal(report.counters.eventInterceptions.keydown, 2);
});

test('product serializer ignores throwing feature and state getters', () => {
  const featureMap = new Proxy({}, {
    get() { throw new Error('feature getter denied'); }
  });
  const stats = new Proxy({ features: featureMap }, {
    get(target, key) {
      if (key === 'features') return target.features;
      throw new Error(`stats getter denied: ${String(key)}`);
    }
  });
  const report = helpers.serializeDiagnosticReport({
    version: '0.9.1', hostname: 'example.com', matchedDomain: 'example.com', stats
  }, SHARED);

  assert.deepEqual(Array.from(report.enabledFeatures), []);
  assert.equal(report.resolutionSource, 'unknown');
  assert.equal(report.mode, 'unknown');
  assert.equal(report.preset, 'unknown');
});

test('product bridge request returns refresh guidance without throwing when bridge is absent or invalid', async () => {
  const absent = await helpers.requestDiagnosticBridge({
    tabs: { query: async () => [{ id: 12 }], sendMessage: async () => undefined }
  });
  const invalid = await helpers.requestDiagnosticBridge({
    tabs: { query: async () => [{ id: 12 }], sendMessage: async () => ({ ok: true, stats: [] }) }
  });

  assert.equal(absent.ok, false);
  assert.match(absent.reason, /새로고침/);
  assert.equal(invalid.ok, false);
  assert.match(invalid.reason, /새로고침/);
});

test('product bridge request feeds the exact stats response to the serializer seam', async () => {
  const stats = makeStats();
  const bridge = await helpers.requestDiagnosticBridge({
    tabs: {
      query: async () => [{ id: 12 }],
      sendMessage: async (tabId, message) => {
        assert.equal(tabId, 12);
        assert.equal(message.type, 'rcow:readDiagnosticStats');
        return { ok: true, stats };
      }
    }
  });
  const report = helpers.serializeDiagnosticReport({
    version: '0.9.1', hostname: 'example.com', matchedDomain: 'example.com', stats: bridge.stats
  }, SHARED);

  assert.equal(bridge.ok, true);
  assert.equal(report.counters.overlaysNeutralized, 5);
  assert.deepEqual(Array.from(report.enabledFeatures), [
    'contextMenu', 'copyShortcuts', 'dragDrop', 'printUnhide', 'shadowDom', 'ultimateCss'
  ]);
});

test('product content handler returns only a parsed bridge snapshot and refresh guidance', () => {
  const stats = makeStats({ ocrText: 'never serialized directly' });
  const handle = loadContentDiagnosticHandler(JSON.stringify(stats));
  const response = handle({ type: 'rcow:readDiagnosticStats' });
  const ignored = handle({ type: 'rcow:unrelated' });
  const absent = loadContentDiagnosticHandler(null)({ type: 'rcow:readDiagnosticStats' });

  assert.equal(response.ok, true);
  assert.equal(response.stats.ocrText, 'never serialized directly');
  assert.equal(ignored, null);
  assert.equal(absent.ok, false);
  assert.match(absent.reason, /새로고침/);
});

test('product copy handler writes only the allowlisted report and announces success', async () => {
  let clipboardText = '';
  const statuses = [];
  const copied = await helpers.copyDiagnosticReport({
    chromeApi: {
      tabs: {
        query: async () => [{ id: 12 }],
        sendMessage: async () => ({ ok: true, stats: makeStats({ ocrText: 'private OCR result' }) })
      }
    },
    clipboard: { writeText: async (text) => { clipboardText = text; } },
    version: '0.9.1',
    hostname: 'example.com',
    matchedDomain: 'example.com',
    SHARED,
    onStatus: (text, kind) => statuses.push({ text, kind })
  });

  assert.equal(copied, true);
  assert.equal(statuses.at(-1).kind, 'success');
  assert.equal(clipboardText.includes('private OCR result'), false);
  assert.equal(clipboardText.includes('ocrText'), false);
  assert.deepEqual(Object.keys(JSON.parse(clipboardText)), [
    'version', 'hostname', 'resolutionSource', 'matchedDomain', 'mode', 'preset', 'enabledFeatures', 'counters'
  ]);
});

test('product copy handler announces clipboard failures without exposing report contents', async () => {
  const statuses = [];
  const copied = await helpers.copyDiagnosticReport({
    chromeApi: {
      tabs: {
        query: async () => [{ id: 12 }],
        sendMessage: async () => ({ ok: true, stats: makeStats() })
      }
    },
    clipboard: { writeText: async () => { throw new Error('denied'); } },
    version: '0.9.1', hostname: 'example.com', matchedDomain: 'example.com', SHARED,
    onStatus: (text, kind) => statuses.push({ text, kind })
  });

  assert.equal(copied, false);
  assert.equal(statuses.at(-1).kind, 'error');
  assert.match(statuses.at(-1).text, /클립보드/);
});

test('product copy handler reports serialization failures separately from clipboard failures', async () => {
  const statuses = [];
  const stats = { features: {} };
  const hostileShared = new Proxy(SHARED, {
    get(target, key) {
      if (key === 'FEATURE_KEYS') {
        return { [Symbol.iterator]() { throw new Error('feature list denied'); } };
      }
      return target[key];
    }
  });
  const copied = await helpers.copyDiagnosticReport({
    chromeApi: {
      tabs: {
        query: async () => [{ id: 12 }],
        sendMessage: async () => ({ ok: true, stats })
      }
    },
    clipboard: { writeText: async () => { throw new Error('clipboard must not be reached'); } },
    version: '0.9.1', hostname: 'example.com', matchedDomain: 'example.com', SHARED: hostileShared,
    onStatus: (text, kind) => statuses.push({ text, kind })
  });

  assert.equal(copied, false);
  assert.equal(statuses.at(-1).kind, 'error');
  assert.match(statuses.at(-1).text, /안전하게 생성하지 못했습니다/);
  assert.doesNotMatch(statuses.at(-1).text, /클립보드/);
});
