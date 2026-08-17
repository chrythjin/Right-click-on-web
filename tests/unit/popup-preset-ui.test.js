'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');

// Load shared.js into a VM context so the pure helpers can use the
// real SHARED module (PRESET_FEATURES, parseDomainSetting, etc.)
// without pulling in browser globals.
function loadShared() {
  const context = vm.createContext({});
  const source = fs.readFileSync(path.join(root, 'shared.js'), 'utf8');
  vm.runInContext(source, context, { filename: 'shared.js' });
  return context.RIGHT_CLICK_ON_WEB_SHARED;
}

// Extract the preset pure helpers from popup.js source. We isolate
// the function bodies so the test does not depend on DOM or chrome.*
// globals. The helpers take SHARED as an explicit parameter.
function loadPresetHelpers() {
  const source = fs.readFileSync(path.join(root, 'popup.js'), 'utf8');
  const helpers = [
    'classifyPreset',
    'computePresetState',
    'computePresetEntry',
    'computeProfilePreservingEntry',
    'computeEffectiveSourceText',
    'computePresetTabindex',
    'resolveCurrentPreset',
    'presetLabelKorean',
    'advancedPresetLabelKorean'
  ];
  const context = vm.createContext({});
  for (const name of helpers) {
    const re = new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`);
    const match = source.match(re);
    if (!match) {
      throw new Error(`${name} function not found in popup.js`);
    }
    vm.runInContext(`${match[0]}; this.${name} = ${name};`, context);
  }
  return {
    classifyPreset: context.classifyPreset,
    computePresetState: context.computePresetState,
    computePresetEntry: context.computePresetEntry,
    computeProfilePreservingEntry: context.computeProfilePreservingEntry,
    computeEffectiveSourceText: context.computeEffectiveSourceText,
    computePresetTabindex: context.computePresetTabindex,
    resolveCurrentPreset: context.resolveCurrentPreset,
    presetLabelKorean: context.presetLabelKorean,
    advancedPresetLabelKorean: context.advancedPresetLabelKorean
  };
}

// Extract the real writeDomainSettings queue from popup.js source and
// run it in a VM with mock SHARED/state/chrome. This tests the actual
// product queue implementation, not a reimplementation.
function loadWriteQueueHarness() {
  const SHARED = loadShared();
  const source = fs.readFileSync(path.join(root, 'popup.js'), 'utf8');

  // Extract the writeDomainSettings function and its tail variable.
  const fnMatch = source.match(/let writeDomainSettingsTail[\s\S]*?return writeDomainSettingsTail;\s*\n\s*\}/);
  if (!fnMatch) {
    throw new Error('writeDomainSettings tail-queue function not found in popup.js');
  }

  let storedDomainSettings = {};
  let writeOrder = [];
  let readDelay = 0;
  let writeDelay = 0;

  const state = { domainSettings: {}, lastWriteFallback: false };
  const chrome = {
    storage: {
      local: { _area: 'local' },
      sync: { _area: 'sync' }
    }
  };

  const mockSHARED = {
    STORAGE_DEFAULTS: SHARED.STORAGE_DEFAULTS,
    resolveSettings: async () => ({ enabled: true, domainSettings: { ...storedDomainSettings } }),
    safeSyncSet: async (obj, fallbackArea) => {
      if (writeDelay > 0) {
        await new Promise(r => setTimeout(r, writeDelay));
      }
      if (obj.domainSettings) {
        storedDomainSettings = { ...obj.domainSettings };
      }
      return { fallback: false };
    }
  };

  const context = vm.createContext({
    SHARED: mockSHARED,
    state,
    chrome,
    console: { error: () => {} },
    Promise,
    setTimeout,
    Date
  });

  vm.runInContext(fnMatch[0], context);

  return {
    writeDomainSettings: context.writeDomainSettings,
    getStored: () => storedDomainSettings,
    setReadDelay: (ms) => { readDelay = ms; },
    setWriteDelay: (ms) => { writeDelay = ms; },
    reset: () => { storedDomainSettings = {}; writeOrder = []; }
  };
}

const SHARED = loadShared();
const helpers = loadPresetHelpers();

// ---- classifyPreset ----

test('classifyPreset: returns popup preset for safe', () => {
  const r = helpers.classifyPreset(SHARED.PRESET_SAFE, SHARED);
  assert.strictEqual(r.displayPreset, SHARED.PRESET_SAFE);
  assert.strictEqual(r.isPopupPreset, true);
});

test('classifyPreset: returns popup preset for complete', () => {
  const r = helpers.classifyPreset(SHARED.PRESET_COMPLETE, SHARED);
  assert.strictEqual(r.displayPreset, SHARED.PRESET_COMPLETE);
  assert.strictEqual(r.isPopupPreset, true);
});

test('classifyPreset: returns popup preset for upload-safe', () => {
  const r = helpers.classifyPreset(SHARED.PRESET_UPLOAD_SAFE, SHARED);
  assert.strictEqual(r.displayPreset, SHARED.PRESET_UPLOAD_SAFE);
  assert.strictEqual(r.isPopupPreset, true);
});

test('classifyPreset: returns null displayPreset for options-only selection', () => {
  const r = helpers.classifyPreset(SHARED.PRESET_SELECTION, SHARED);
  assert.strictEqual(r.displayPreset, null);
  assert.strictEqual(r.isPopupPreset, false);
});

test('classifyPreset: returns null displayPreset for options-only media-safe', () => {
  const r = helpers.classifyPreset(SHARED.PRESET_MEDIA_SAFE, SHARED);
  assert.strictEqual(r.displayPreset, null);
  assert.strictEqual(r.isPopupPreset, false);
});

test('classifyPreset: returns null displayPreset for options-only custom', () => {
  const r = helpers.classifyPreset(SHARED.PRESET_CUSTOM, SHARED);
  assert.strictEqual(r.displayPreset, null);
  assert.strictEqual(r.isPopupPreset, false);
});

// ---- computePresetState: parent inheritance ----

test('computePresetState: no hostname returns global source and complete preset', () => {
  const result = helpers.computePresetState({ hostname: '' }, SHARED);
  assert.strictEqual(result.displayPreset, SHARED.PRESET_COMPLETE);
  assert.strictEqual(result.isPopupPreset, true);
  assert.strictEqual(result.source, 'global');
  assert.strictEqual(result.hasMatchedEntry, false);
  assert.strictEqual(result.canSelect, false);
});

test('computePresetState: no matched entry returns global source and complete preset', () => {
  const state = {
    hostname: 'www.example.com',
    matchedKey: null,
    domainSettings: {},
    sessionActive: false
  };
  const result = helpers.computePresetState(state, SHARED);
  assert.strictEqual(result.displayPreset, SHARED.PRESET_COMPLETE);
  assert.strictEqual(result.isPopupPreset, true);
  assert.strictEqual(result.source, 'global');
  assert.strictEqual(result.hasMatchedEntry, false);
  assert.strictEqual(result.canSelect, true);
});

test('computePresetState: exact-host entry returns domain source and entry preset', () => {
  const state = {
    hostname: 'example.com',
    matchedKey: 'example.com',
    domainSettings: { 'example.com': { enabled: true, mode: 'ultimate', preset: 'safe' } },
    sessionActive: false
  };
  const result = helpers.computePresetState(state, SHARED);
  assert.strictEqual(result.displayPreset, SHARED.PRESET_SAFE);
  assert.strictEqual(result.isPopupPreset, true);
  assert.strictEqual(result.source, 'domain');
  assert.strictEqual(result.hasMatchedEntry, true);
  assert.strictEqual(result.canSelect, true);
});

test('computePresetState: parent-domain matchedKey derives profile from parent entry', () => {
  const state = {
    hostname: 'www.example.com',
    matchedKey: 'example.com',
    domainSettings: { 'example.com': { enabled: true, mode: 'ultimate', preset: 'upload-safe' } },
    sessionActive: false
  };
  const result = helpers.computePresetState(state, SHARED);
  assert.strictEqual(result.displayPreset, SHARED.PRESET_UPLOAD_SAFE);
  assert.strictEqual(result.isPopupPreset, true);
  assert.strictEqual(result.source, 'domain');
  assert.strictEqual(result.hasMatchedEntry, true);
  assert.strictEqual(result.matchedKey, 'example.com');
  assert.strictEqual(result.canSelect, true);
});

test('computePresetState: parent-domain matchedKey with options-only preset shows honest display', () => {
  const state = {
    hostname: 'www.example.com',
    matchedKey: 'example.com',
    domainSettings: { 'example.com': { enabled: true, mode: 'ultimate', preset: 'selection' } },
    sessionActive: false
  };
  const result = helpers.computePresetState(state, SHARED);
  assert.strictEqual(result.isPopupPreset, false);
  assert.strictEqual(result.displayPreset, SHARED.PRESET_SELECTION);
  assert.strictEqual(result.source, 'domain');
  assert.strictEqual(result.hasMatchedEntry, true);
  assert.strictEqual(result.canSelect, true);
});

test('computePresetState: custom preset shows honest display, not false complete', () => {
  const state = {
    hostname: 'example.com',
    matchedKey: 'example.com',
    domainSettings: { 'example.com': { enabled: true, mode: 'lite', preset: 'custom' } },
    sessionActive: false
  };
  const result = helpers.computePresetState(state, SHARED);
  assert.strictEqual(result.isPopupPreset, false);
  assert.strictEqual(result.displayPreset, SHARED.PRESET_CUSTOM);
});

test('computePresetState: media-safe preset shows honest display, not false complete', () => {
  const state = {
    hostname: 'example.com',
    matchedKey: 'example.com',
    domainSettings: { 'example.com': { enabled: true, mode: 'ultimate', preset: 'media-safe' } },
    sessionActive: false
  };
  const result = helpers.computePresetState(state, SHARED);
  assert.strictEqual(result.isPopupPreset, false);
  assert.strictEqual(result.displayPreset, SHARED.PRESET_MEDIA_SAFE);
});

// ---- computePresetState: session editability ----

test('computePresetState: session active still allows preset selection (canSelect true)', () => {
  const state = {
    hostname: 'example.com',
    matchedKey: 'example.com',
    domainSettings: { 'example.com': { enabled: false, mode: 'ultimate', preset: 'safe' } },
    sessionActive: true
  };
  const result = helpers.computePresetState(state, SHARED);
  assert.strictEqual(result.canSelect, true);
  assert.strictEqual(result.source, 'session');
  assert.strictEqual(result.displayPreset, SHARED.PRESET_SAFE);
});

test('computePresetState: session active with no matched entry still allows selection', () => {
  const state = {
    hostname: 'example.com',
    matchedKey: null,
    domainSettings: {},
    sessionActive: true
  };
  const result = helpers.computePresetState(state, SHARED);
  assert.strictEqual(result.canSelect, true);
  assert.strictEqual(result.source, 'session');
  assert.strictEqual(result.displayPreset, SHARED.PRESET_COMPLETE);
});

// ---- computePresetEntry: full canonical snapshot ----

test('computePresetEntry: unsaved hostname stores full canonical {enabled,mode,preset,features}', () => {
  const entry = helpers.computePresetEntry(null, SHARED.PRESET_UPLOAD_SAFE, SHARED);
  assert.strictEqual(entry.enabled, true);
  assert.strictEqual(entry.mode, SHARED.DEFAULT_MODE);
  assert.strictEqual(entry.preset, SHARED.PRESET_UPLOAD_SAFE);
  assert.ok(entry.features, 'features must be present');
  assert.deepEqual(entry.features, SHARED.PRESET_FEATURES[SHARED.PRESET_UPLOAD_SAFE]);
});

test('computePresetEntry: unsaved hostname safe preset stores full canonical snapshot', () => {
  const entry = helpers.computePresetEntry(null, SHARED.PRESET_SAFE, SHARED);
  assert.strictEqual(entry.preset, SHARED.PRESET_SAFE);
  assert.deepEqual(entry.features, SHARED.PRESET_FEATURES[SHARED.PRESET_SAFE]);
});

test('computePresetEntry: unsaved hostname complete preset stores full canonical snapshot', () => {
  const entry = helpers.computePresetEntry(null, SHARED.PRESET_COMPLETE, SHARED);
  assert.strictEqual(entry.preset, SHARED.PRESET_COMPLETE);
  assert.deepEqual(entry.features, SHARED.PRESET_FEATURES[SHARED.PRESET_COMPLETE]);
});

test('computePresetEntry: existing entry preserves enabled and mode, replaces preset and features', () => {
  const current = { enabled: false, mode: 'lite', preset: 'complete' };
  const entry = helpers.computePresetEntry(current, SHARED.PRESET_SAFE, SHARED);
  assert.strictEqual(entry.enabled, false);
  assert.strictEqual(entry.mode, 'lite');
  assert.strictEqual(entry.preset, SHARED.PRESET_SAFE);
  assert.deepEqual(JSON.parse(JSON.stringify(entry.features)), {
    ...SHARED.PRESET_FEATURES[SHARED.PRESET_SAFE],
    ultimateCss: false
  });
});

test('computePresetEntry: all 9 feature booleans present in stored entry', () => {
  const entry = helpers.computePresetEntry(null, SHARED.PRESET_SAFE, SHARED);
  for (const key of SHARED.FEATURE_KEYS) {
    assert.ok(typeof entry.features[key] === 'boolean', `feature ${key} must be boolean`);
  }
  assert.strictEqual(Object.keys(entry.features).length, SHARED.FEATURE_KEYS.length);
});

test('computePresetEntry: legacy boolean shape normalizes to full canonical snapshot', () => {
  const entry = helpers.computePresetEntry(true, SHARED.PRESET_COMPLETE, SHARED);
  assert.strictEqual(entry.enabled, true);
  assert.strictEqual(entry.mode, SHARED.DEFAULT_MODE);
  assert.strictEqual(entry.preset, SHARED.PRESET_COMPLETE);
  assert.deepEqual(entry.features, SHARED.PRESET_FEATURES[SHARED.PRESET_COMPLETE]);
});

// ---- computeProfilePreservingEntry: profile preservation ----

test('computeProfilePreservingEntry: toggle enabled preserves existing preset and features', () => {
  const current = { enabled: true, mode: 'ultimate', preset: 'upload-safe' };
  const entry = helpers.computeProfilePreservingEntry(current, { enabled: false }, SHARED);
  assert.strictEqual(entry.enabled, false);
  assert.strictEqual(entry.mode, 'ultimate');
  assert.strictEqual(entry.preset, SHARED.PRESET_UPLOAD_SAFE);
  assert.deepEqual(entry.features, SHARED.PRESET_FEATURES[SHARED.PRESET_UPLOAD_SAFE]);
});

test('computeProfilePreservingEntry: mode change preserves existing preset and features', () => {
  const current = { enabled: true, mode: 'ultimate', preset: 'safe' };
  const entry = helpers.computeProfilePreservingEntry(current, { mode: 'lite' }, SHARED);
  assert.strictEqual(entry.enabled, true);
  assert.strictEqual(entry.mode, 'lite');
  assert.strictEqual(entry.preset, SHARED.PRESET_SAFE);
  assert.deepEqual(JSON.parse(JSON.stringify(entry.features)), {
    ...SHARED.PRESET_FEATURES[SHARED.PRESET_SAFE],
    ultimateCss: false
  });
});

test('computeProfilePreservingEntry: creating from null preserves default complete profile', () => {
  const entry = helpers.computeProfilePreservingEntry(null, { enabled: true, mode: 'ultimate' }, SHARED);
  assert.strictEqual(entry.enabled, true);
  assert.strictEqual(entry.mode, 'ultimate');
  assert.strictEqual(entry.preset, SHARED.PRESET_COMPLETE);
  assert.deepEqual(entry.features, SHARED.PRESET_FEATURES[SHARED.PRESET_COMPLETE]);
});

test('computeProfilePreservingEntry: creating from parent with custom preset preserves custom', () => {
  const parent = { enabled: true, mode: 'ultimate', preset: 'custom', features: { contextMenu: true, selection: false, copyShortcuts: true, dragStart: false, dragDrop: false, overlayCleanup: false, printUnhide: false, shadowDom: false, ultimateCss: true } };
  const entry = helpers.computeProfilePreservingEntry(parent, { enabled: true }, SHARED);
  assert.strictEqual(entry.preset, SHARED.PRESET_CUSTOM);
  assert.strictEqual(entry.features.selection, false);
  assert.strictEqual(entry.features.dragDrop, false);
});

// ---- computeEffectiveSourceText: session/source wording ----

test('computeEffectiveSourceText: session source with matched entry mentions session and domain profile', () => {
  const text = helpers.computeEffectiveSourceText('session', SHARED.PRESET_SAFE, true, true, SHARED);
  assert.ok(text.includes('세션'), `expected session wording, got: ${text}`);
  assert.ok(text.includes('도메인 설정'), `expected domain profile origin, got: ${text}`);
  assert.ok(text.includes('안전'), `expected preset label, got: ${text}`);
});

test('computeEffectiveSourceText: session source without matched entry mentions default', () => {
  const text = helpers.computeEffectiveSourceText('session', SHARED.PRESET_COMPLETE, true, false, SHARED);
  assert.ok(text.includes('세션'), `expected session wording, got: ${text}`);
  assert.ok(text.includes('기본값'), `expected default origin, got: ${text}`);
  assert.ok(text.includes('완전'), `expected preset label, got: ${text}`);
});

test('computeEffectiveSourceText: domain source mentions domain and preset', () => {
  const text = helpers.computeEffectiveSourceText('domain', SHARED.PRESET_UPLOAD_SAFE, true, true, SHARED);
  assert.ok(text.includes('도메인'), `expected domain wording, got: ${text}`);
  assert.ok(text.includes('업로드 보호'), `expected preset label, got: ${text}`);
  assert.ok(!text.includes('세션'), `should not mention session, got: ${text}`);
});

test('computeEffectiveSourceText: global source mentions global and complete', () => {
  const text = helpers.computeEffectiveSourceText('global', SHARED.PRESET_COMPLETE, true, false, SHARED);
  assert.ok(text.includes('전역'), `expected global wording, got: ${text}`);
  assert.ok(text.includes('완전'), `expected preset label, got: ${text}`);
});

test('computeEffectiveSourceText: options-only preset uses advanced label', () => {
  const text = helpers.computeEffectiveSourceText('domain', SHARED.PRESET_SELECTION, false, true, SHARED);
  assert.ok(text.includes('선택 (고급)'), `expected advanced label, got: ${text}`);
});

test('computeEffectiveSourceText: custom preset uses advanced label', () => {
  const text = helpers.computeEffectiveSourceText('domain', SHARED.PRESET_CUSTOM, false, true, SHARED);
  assert.ok(text.includes('사용자 정의 (고급)'), `expected advanced label, got: ${text}`);
});

// ---- presetLabelKorean / advancedPresetLabelKorean ----

test('presetLabelKorean: maps all three popup presets to Korean', () => {
  assert.strictEqual(helpers.presetLabelKorean('safe'), '안전');
  assert.strictEqual(helpers.presetLabelKorean('complete'), '완전');
  assert.strictEqual(helpers.presetLabelKorean('upload-safe'), '업로드 보호');
});

test('advancedPresetLabelKorean: maps options-only presets to Korean advanced labels', () => {
  assert.strictEqual(helpers.advancedPresetLabelKorean('selection'), '선택 (고급)');
  assert.strictEqual(helpers.advancedPresetLabelKorean('media-safe'), '미디어 보호 (고급)');
  assert.strictEqual(helpers.advancedPresetLabelKorean('custom'), '사용자 정의 (고급)');
});

// ---- Real product queue: call-order serialization ----
// These tests extract the actual writeDomainSettings function from
// popup.js and run it in a VM with mock storage. They prove the
// promise-tail queue preserves call order under deferred async
// reads/writes — not a reimplementation.

test('real product queue: rapid safe -> complete -> upload-safe serializes in call order', async () => {
  const harness = loadWriteQueueHarness();
  const hostname = 'example.com';
  const safeEntry = helpers.computePresetEntry(null, SHARED.PRESET_SAFE, SHARED);
  const completeEntry = helpers.computePresetEntry(null, SHARED.PRESET_COMPLETE, SHARED);
  const uploadSafeEntry = helpers.computePresetEntry(null, SHARED.PRESET_UPLOAD_SAFE, SHARED);

  const p1 = harness.writeDomainSettings({ [hostname]: safeEntry });
  const p2 = harness.writeDomainSettings({ [hostname]: completeEntry });
  const p3 = harness.writeDomainSettings({ [hostname]: uploadSafeEntry });

  await Promise.all([p1, p2, p3]);

  const stored = harness.getStored();
  assert.strictEqual(
    stored[hostname].preset,
    SHARED.PRESET_UPLOAD_SAFE,
    'final state should be upload-safe (last write wins)'
  );
});

test('real product queue: preserves call order under deferred async writes', async () => {
  const harness = loadWriteQueueHarness();
  harness.setWriteDelay(10);
  const hostname = 'example.com';

  const order = [];
  const makeEntry = (preset) => helpers.computePresetEntry(null, preset, SHARED);

  // Fire three writes in rapid succession; with writeDelay, the
  // second and third must wait for the first to complete.
  const p1 = harness.writeDomainSettings({ [hostname]: makeEntry(SHARED.PRESET_SAFE) }).then(() => order.push(1));
  const p2 = harness.writeDomainSettings({ [hostname]: makeEntry(SHARED.PRESET_COMPLETE) }).then(() => order.push(2));
  const p3 = harness.writeDomainSettings({ [hostname]: makeEntry(SHARED.PRESET_UPLOAD_SAFE) }).then(() => order.push(3));

  await Promise.all([p1, p2, p3]);

  assert.deepEqual(order, [1, 2, 3], 'writes must complete in call order');
  assert.strictEqual(harness.getStored()[hostname].preset, SHARED.PRESET_UPLOAD_SAFE);
});

test('real product queue: interleaved hostname writes do not lose siblings', async () => {
  const harness = loadWriteQueueHarness();
  harness.setWriteDelay(5);

  const entryA = helpers.computePresetEntry(null, SHARED.PRESET_SAFE, SHARED);
  const entryB = helpers.computePresetEntry(null, SHARED.PRESET_UPLOAD_SAFE, SHARED);

  const p1 = harness.writeDomainSettings({ 'a.com': entryA });
  const p2 = harness.writeDomainSettings({ 'b.com': entryB });
  const p3 = harness.writeDomainSettings({ 'a.com': helpers.computePresetEntry(null, SHARED.PRESET_COMPLETE, SHARED) });

  await Promise.all([p1, p2, p3]);

  const stored = harness.getStored();
  assert.strictEqual(stored['a.com'].preset, SHARED.PRESET_COMPLETE, 'a.com should be complete (last write)');
  assert.strictEqual(stored['b.com'].preset, SHARED.PRESET_UPLOAD_SAFE, 'b.com should be preserved as upload-safe');
});

// ---- parseDomainSetting round-trip: full canonical snapshot ----

test('parseDomainSetting round-trips computePresetEntry output for upload-safe with all 9 features', () => {
  const entry = helpers.computePresetEntry(null, SHARED.PRESET_UPLOAD_SAFE, SHARED);
  const parsed = SHARED.parseDomainSetting(entry);
  assert.strictEqual(parsed.preset, SHARED.PRESET_UPLOAD_SAFE);
  assert.strictEqual(parsed.enabled, true);
  assert.deepEqual(parsed.features, SHARED.PRESET_FEATURES[SHARED.PRESET_UPLOAD_SAFE]);
  assert.strictEqual(Object.keys(parsed.features).length, SHARED.FEATURE_KEYS.length);
});

test('parseDomainSetting round-trips computePresetEntry output for safe with all 9 features', () => {
  const entry = helpers.computePresetEntry(null, SHARED.PRESET_SAFE, SHARED);
  const parsed = SHARED.parseDomainSetting(entry);
  assert.strictEqual(parsed.preset, SHARED.PRESET_SAFE);
  assert.deepEqual(parsed.features, SHARED.PRESET_FEATURES[SHARED.PRESET_SAFE]);
});

test('parseDomainSetting round-trips computePresetEntry output for complete with all 9 features', () => {
  const entry = helpers.computePresetEntry(null, SHARED.PRESET_COMPLETE, SHARED);
  const parsed = SHARED.parseDomainSetting(entry);
  assert.strictEqual(parsed.preset, SHARED.PRESET_COMPLETE);
  assert.deepEqual(parsed.features, SHARED.PRESET_FEATURES[SHARED.PRESET_COMPLETE]);
});

test('parseDomainSetting round-trips computeProfilePreservingEntry output preserving custom features', () => {
  const parent = { enabled: true, mode: 'ultimate', preset: 'custom', features: { contextMenu: true, selection: false, copyShortcuts: true, dragStart: false, dragDrop: false, overlayCleanup: false, printUnhide: false, shadowDom: false, ultimateCss: true } };
  const entry = helpers.computeProfilePreservingEntry(parent, { enabled: false }, SHARED);
  const parsed = SHARED.parseDomainSetting(entry);
  assert.strictEqual(parsed.preset, SHARED.PRESET_CUSTOM);
  assert.strictEqual(parsed.enabled, false);
  assert.strictEqual(parsed.features.selection, false);
  assert.strictEqual(parsed.features.dragDrop, false);
});

// ---- computePresetTabindex: roving tabindex accessibility ----

test('computePresetTabindex: active popup preset gets tabindex=0', () => {
  assert.strictEqual(
    helpers.computePresetTabindex(SHARED.PRESET_SAFE, true, true, true, SHARED),
    0
  );
  assert.strictEqual(
    helpers.computePresetTabindex(SHARED.PRESET_COMPLETE, true, true, true, SHARED),
    0
  );
  assert.strictEqual(
    helpers.computePresetTabindex(SHARED.PRESET_UPLOAD_SAFE, true, true, true, SHARED),
    0
  );
});

test('computePresetTabindex: non-active popup preset gets tabindex=-1', () => {
  assert.strictEqual(
    helpers.computePresetTabindex(SHARED.PRESET_SAFE, false, true, true, SHARED),
    -1
  );
  assert.strictEqual(
    helpers.computePresetTabindex(SHARED.PRESET_UPLOAD_SAFE, false, true, true, SHARED),
    -1
  );
});

test('computePresetTabindex: options-only profile gives Complete button tabindex=0 anchor', () => {
  // isPopupPreset=false, isActive=false for all three buttons
  // Complete must get tabindex=0 as the focus anchor
  assert.strictEqual(
    helpers.computePresetTabindex(SHARED.PRESET_COMPLETE, false, false, true, SHARED),
    0
  );
});

test('computePresetTabindex: options-only profile gives non-Complete buttons tabindex=-1', () => {
  assert.strictEqual(
    helpers.computePresetTabindex(SHARED.PRESET_SAFE, false, false, true, SHARED),
    -1
  );
  assert.strictEqual(
    helpers.computePresetTabindex(SHARED.PRESET_UPLOAD_SAFE, false, false, true, SHARED),
    -1
  );
});

test('computePresetTabindex: disabled buttons always get tabindex=-1 even for Complete anchor', () => {
  assert.strictEqual(
    helpers.computePresetTabindex(SHARED.PRESET_COMPLETE, false, false, false, SHARED),
    -1
  );
  assert.strictEqual(
    helpers.computePresetTabindex(SHARED.PRESET_SAFE, true, true, false, SHARED),
    -1
  );
});

test('computePresetTabindex: exactly one button gets tabindex=0 for popup preset active', () => {
  // Simulate render loop: safe is active
  const buttons = [SHARED.PRESET_SAFE, SHARED.PRESET_COMPLETE, SHARED.PRESET_UPLOAD_SAFE];
  const tabindices = buttons.map(id =>
    helpers.computePresetTabindex(id, id === SHARED.PRESET_SAFE, true, true, SHARED)
  );
  const zeros = tabindices.filter(t => t === 0);
  assert.strictEqual(zeros.length, 1, 'exactly one button should have tabindex=0');
  assert.strictEqual(tabindices[0], 0, 'safe should be the focus anchor');
});

test('computePresetTabindex: exactly one button gets tabindex=0 for options-only profile', () => {
  // Simulate render loop: no popup preset active (options-only)
  const buttons = [SHARED.PRESET_SAFE, SHARED.PRESET_COMPLETE, SHARED.PRESET_UPLOAD_SAFE];
  const tabindices = buttons.map(id =>
    helpers.computePresetTabindex(id, false, false, true, SHARED)
  );
  const zeros = tabindices.filter(t => t === 0);
  assert.strictEqual(zeros.length, 1, 'exactly one button should have tabindex=0');
  assert.strictEqual(tabindices[1], 0, 'complete should be the focus anchor');
});

test('computePresetTabindex: no hostname (canSelect=false) gives all tabindex=-1', () => {
  const buttons = [SHARED.PRESET_SAFE, SHARED.PRESET_COMPLETE, SHARED.PRESET_UPLOAD_SAFE];
  const tabindices = buttons.map(id =>
    helpers.computePresetTabindex(id, false, true, false, SHARED)
  );
  const zeros = tabindices.filter(t => t === 0);
  assert.strictEqual(zeros.length, 0, 'no button should have tabindex=0 when disabled');
});

// ---- resolveCurrentPreset: handler decision path ----
// These tests exercise the real popup handler's preset-resolution
// logic (resolveCurrentPreset), not keyboard-utils in isolation.
// They prove the handler starts navigation from the actually
// focused radio (currentTarget), falling back to the tabindex anchor,
// then the active radio, then Complete.

function makeMockButton(id, tabindex, isActive) {
  return {
    id,
    getAttribute(attr) {
      if (attr === 'tabindex') return String(tabindex);
      return null;
    },
    classList: { contains(cls) { return cls === 'is-active' ? isActive : false; } }
  };
}

function makeButtons(spec) {
  return spec.map(([id, tabindex, isActive]) => {
    const el = makeMockButton(id, tabindex, isActive);
    return { el, id };
  });
}

const KB = require('../../keyboard-utils.js');

test('resolveCurrentPreset: currentTarget takes priority over tabindex anchor', () => {
  // Safe has tabindex=0 (the anchor), but upload-safe received the keydown
  const buttons = makeButtons([
    [KB.PRESET_SAFE, 0, true],
    [KB.PRESET_COMPLETE, -1, false],
    [KB.PRESET_UPLOAD_SAFE, -1, false]
  ]);
  const focusedEl = buttons[2].el; // upload-safe received keydown
  const result = helpers.resolveCurrentPreset(focusedEl, buttons, KB);
  assert.strictEqual(result, KB.PRESET_UPLOAD_SAFE);
});

test('resolveCurrentPreset: falls back to tabindex=0 anchor when no currentTarget', () => {
  // Options-only profile: Complete is the anchor (tabindex=0, not active)
  const buttons = makeButtons([
    [KB.PRESET_SAFE, -1, false],
    [KB.PRESET_COMPLETE, 0, false],
    [KB.PRESET_UPLOAD_SAFE, -1, false]
  ]);
  const result = helpers.resolveCurrentPreset(null, buttons, KB);
  assert.strictEqual(result, KB.PRESET_COMPLETE);
});

test('resolveCurrentPreset: falls back to .is-active when no currentTarget and no anchor', () => {
  // Render hasn't run yet: no tabindex=0, but safe has .is-active
  const buttons = makeButtons([
    [KB.PRESET_SAFE, -1, true],
    [KB.PRESET_COMPLETE, -1, false],
    [KB.PRESET_UPLOAD_SAFE, -1, false]
  ]);
  const result = helpers.resolveCurrentPreset(null, buttons, KB);
  assert.strictEqual(result, KB.PRESET_SAFE);
});

test('resolveCurrentPreset: falls back to Complete when nothing matches', () => {
  const buttons = makeButtons([
    [KB.PRESET_SAFE, -1, false],
    [KB.PRESET_COMPLETE, -1, false],
    [KB.PRESET_UPLOAD_SAFE, -1, false]
  ]);
  const result = helpers.resolveCurrentPreset(null, buttons, KB);
  assert.strictEqual(result, KB.PRESET_COMPLETE);
});

test('resolveCurrentPreset: currentTarget that is not in buttons list is ignored', () => {
  // A foreign element somehow received the keydown — fall back to anchor
  const buttons = makeButtons([
    [KB.PRESET_SAFE, -1, false],
    [KB.PRESET_COMPLETE, 0, false],
    [KB.PRESET_UPLOAD_SAFE, -1, false]
  ]);
  const foreignEl = makeMockButton('foreign', -1, false);
  const result = helpers.resolveCurrentPreset(foreignEl, buttons, KB);
  assert.strictEqual(result, KB.PRESET_COMPLETE);
});

// ---- Handler decision path: Arrow/Home/End from options-only anchor ----
// These tests prove the full handler decision path: resolveCurrentPreset
// (the real popup helper) feeds into keyboard-utils.getNextPresetFromKeydown,
// producing the expected navigation from the Complete focus anchor.

test('handler path: ArrowRight from options-only Complete anchor selects upload-safe', () => {
  const buttons = makeButtons([
    [KB.PRESET_SAFE, -1, false],
    [KB.PRESET_COMPLETE, 0, false],
    [KB.PRESET_UPLOAD_SAFE, -1, false]
  ]);
  const current = helpers.resolveCurrentPreset(null, buttons, KB);
  const next = KB.getNextPresetFromKeydown(current, 'ArrowRight');
  assert.strictEqual(next, KB.PRESET_UPLOAD_SAFE);
});

test('handler path: ArrowLeft from options-only Complete anchor selects safe', () => {
  const buttons = makeButtons([
    [KB.PRESET_SAFE, -1, false],
    [KB.PRESET_COMPLETE, 0, false],
    [KB.PRESET_UPLOAD_SAFE, -1, false]
  ]);
  const current = helpers.resolveCurrentPreset(null, buttons, KB);
  const next = KB.getNextPresetFromKeydown(current, 'ArrowLeft');
  assert.strictEqual(next, KB.PRESET_SAFE);
});

test('handler path: Home from options-only Complete anchor selects safe', () => {
  const buttons = makeButtons([
    [KB.PRESET_SAFE, -1, false],
    [KB.PRESET_COMPLETE, 0, false],
    [KB.PRESET_UPLOAD_SAFE, -1, false]
  ]);
  const current = helpers.resolveCurrentPreset(null, buttons, KB);
  const next = KB.getNextPresetFromKeydown(current, 'Home');
  assert.strictEqual(next, KB.PRESET_SAFE);
});

test('handler path: End from options-only Complete anchor selects upload-safe', () => {
  const buttons = makeButtons([
    [KB.PRESET_SAFE, -1, false],
    [KB.PRESET_COMPLETE, 0, false],
    [KB.PRESET_UPLOAD_SAFE, -1, false]
  ]);
  const current = helpers.resolveCurrentPreset(null, buttons, KB);
  const next = KB.getNextPresetFromKeydown(current, 'End');
  assert.strictEqual(next, KB.PRESET_UPLOAD_SAFE);
});

// ---- Handler decision path: currentTarget priority changes navigation ----
// A pointer-clicked tabindex=-1 radio receives keydown before async
// render updates tabindex. Navigation must start from that radio,
// not the stale tabindex=0 anchor.

test('handler path: ArrowRight from currentTarget safe (not anchor) selects complete', () => {
  // Safe was clicked (tabindex=-1), Complete is the stale anchor (tabindex=0)
  const buttons = makeButtons([
    [KB.PRESET_SAFE, -1, false],
    [KB.PRESET_COMPLETE, 0, false],
    [KB.PRESET_UPLOAD_SAFE, -1, false]
  ]);
  const current = helpers.resolveCurrentPreset(buttons[0].el, buttons, KB);
  assert.strictEqual(current, KB.PRESET_SAFE, 'currentTarget safe should win over anchor');
  const next = KB.getNextPresetFromKeydown(current, 'ArrowRight');
  assert.strictEqual(next, KB.PRESET_COMPLETE);
});

test('handler path: ArrowLeft from currentTarget upload-safe (not anchor) selects complete', () => {
  // Upload-safe was clicked (tabindex=-1), Complete is the stale anchor (tabindex=0)
  const buttons = makeButtons([
    [KB.PRESET_SAFE, -1, false],
    [KB.PRESET_COMPLETE, 0, false],
    [KB.PRESET_UPLOAD_SAFE, -1, false]
  ]);
  const current = helpers.resolveCurrentPreset(buttons[2].el, buttons, KB);
  assert.strictEqual(current, KB.PRESET_UPLOAD_SAFE, 'currentTarget upload-safe should win over anchor');
  const next = KB.getNextPresetFromKeydown(current, 'ArrowLeft');
  assert.strictEqual(next, KB.PRESET_COMPLETE);
});

test('popup mode keydown handler returns without throwing when keyboard-utils is missing', () => {
  const source = fs.readFileSync(path.join(root, 'popup.js'), 'utf8');
  const start = source.indexOf('const KB = globalThis.RIGHT_CLICK_ON_WEB_KEYBOARD_UTILS;');
  const end = source.indexOf('elements.modeLite.addEventListener', start);
  const context = vm.createContext({
    console: { warn() {} },
    elements: {
      modeLite: { disabled: false, classList: { contains() { return true; } } },
      modeUltimate: { disabled: false, classList: { contains() { return false; } } }
    },
    handleModeSelect() {}
  });
  vm.runInContext(`${source.slice(start, end)}; this.handleModeKeydown = handleModeKeydown;`, context);
  assert.doesNotThrow(() => context.handleModeKeydown({ key: 'ArrowRight' }));
});
