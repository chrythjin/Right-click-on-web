const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const sharedPath = path.join(__dirname, '..', '..', 'shared.js');
const shared = require(sharedPath);

function loadBrowserShared() {
  const context = vm.createContext({ URL });
  vm.runInContext(fs.readFileSync(sharedPath, 'utf8'), context, { filename: 'shared.js' });
  return context.RIGHT_CLICK_ON_WEB_SHARED;
}

test('Node loads only the pure settings seam', () => {
  assert.equal(globalThis.RIGHT_CLICK_ON_WEB_SHARED, undefined);
  assert.deepEqual(Object.keys(shared).sort(), [
    'DEFAULT_THEME',
    'VALID_THEMES',
    'normalizeDomainSettings',
    'parseDomainSetting',
    'resolveTheme'
  ]);
});

test('browser shared namespace exposes the canonical feature profile contract', () => {
  const browserShared = loadBrowserShared();

  assert.deepEqual(Array.from(browserShared.VALID_PRESETS), [
    'safe', 'selection', 'complete', 'upload-safe', 'media-safe', 'custom'
  ]);
  assert.deepEqual(Array.from(browserShared.FEATURE_KEYS), [
    'contextMenu', 'selection', 'copyShortcuts', 'dragStart', 'dragDrop',
    'overlayCleanup', 'printUnhide', 'shadowDom', 'ultimateCss'
  ]);
  assert.equal(Object.values(browserShared.DEFAULT_FEATURES).every((value) => value === true), true);
  assert.equal(Object.isFrozen(browserShared.DEFAULT_FEATURES), true);
});

test('legacy booleans and enabled-only objects retain enabled state and complete behavior', () => {
  for (const [input, enabled] of [[true, true], [false, false], [{ enabled: true }, true], [{ enabled: false }, false]]) {
    const parsed = shared.parseDomainSetting(input);
    assert.equal(parsed.enabled, enabled);
    assert.equal(parsed.mode, 'ultimate');
    assert.equal(parsed.preset, 'complete');
    assert.equal(Object.values(parsed.features).every((value) => value === true), true);
  }
});

test('legacy mode objects retain Lite and Ultimate behavior', () => {
  const lite = shared.parseDomainSetting({ enabled: true, mode: 'lite' });
  const ultimate = shared.parseDomainSetting({ enabled: false, mode: 'ultimate' });

  assert.equal(lite.enabled, true);
  assert.equal(lite.mode, 'lite');
  assert.equal(lite.preset, 'custom');
  assert.equal(lite.features.ultimateCss, false);
  assert.equal(Object.entries(lite.features).every(([key, value]) => key === 'ultimateCss' || value === true), true);
  assert.equal(ultimate.enabled, false);
  assert.equal(ultimate.mode, 'ultimate');
  assert.equal(ultimate.preset, 'complete');
  assert.equal(Object.values(ultimate.features).every((value) => value === true), true);
});

test('Lite mode disables Ultimate CSS for named presets while preserving canonical features', () => {
  const browserShared = loadBrowserShared();

  for (const preset of ['complete', 'safe']) {
    const parsed = shared.parseDomainSetting({ enabled: true, mode: 'lite', preset });
    const expected = {
      ...JSON.parse(JSON.stringify(browserShared.PRESET_FEATURES[preset])),
      ultimateCss: false
    };

    assert.equal(parsed.mode, 'lite');
    assert.equal(parsed.preset, preset);
    assert.deepEqual(parsed.features, expected);
    assert.equal(Object.keys(parsed.features).length, 9);
  }

  const ultimate = shared.parseDomainSetting({ enabled: true, mode: 'ultimate', preset: 'complete' });
  assert.deepEqual(
    ultimate.features,
    JSON.parse(JSON.stringify(browserShared.PRESET_FEATURES.complete))
  );
});

test('every preset replaces supplied features with its canonical complete snapshot', () => {
  const browserShared = loadBrowserShared();
  for (const preset of browserShared.VALID_PRESETS.filter((value) => value !== 'custom')) {
    const parsed = shared.parseDomainSetting({
      enabled: true,
      mode: 'ultimate',
      preset,
      features: { contextMenu: false, unknownFeature: true }
    });
    assert.equal(parsed.preset, preset);
    assert.deepEqual(
      parsed.features,
      JSON.parse(JSON.stringify(browserShared.PRESET_FEATURES[preset]))
    );
    assert.equal(Object.hasOwn(parsed.features, 'unknownFeature'), false);
  }
});

test('partial custom features fill defaults and only accept own allowlisted booleans', () => {
  const features = Object.create(null);
  features.contextMenu = false;
  features.copyShortcuts = 'false';
  features.unknownFeature = true;
  features.__proto__ = true;

  const parsed = shared.parseDomainSetting({ preset: 'custom', features });

  assert.equal(parsed.preset, 'custom');
  assert.equal(parsed.features.contextMenu, false);
  assert.equal(parsed.features.selection, true);
  assert.equal(parsed.features.copyShortcuts, true);
  assert.equal(Object.hasOwn(parsed.features, 'unknownFeature'), false);
  assert.equal(Object.hasOwn(parsed.features, '__proto__'), false);
  assert.equal(Object.keys(parsed.features).length, 9);
});

test('invalid strings, null, arrays, and non-plain objects normalize to disabled complete settings', () => {
  class DomainSetting {
    constructor() {
      this.enabled = true;
      this.preset = 'custom';
      this.features = { contextMenu: false };
    }
  }
  const forgedPrototype = Object.create(null);
  forgedPrototype.constructor = Object;
  const forgedOrdinaryObject = Object.assign(Object.create(forgedPrototype), { enabled: true });

  for (const input of ['invalid', null, [], new Date(0), new DomainSetting(), forgedOrdinaryObject]) {
    const parsed = shared.parseDomainSetting(input);
    assert.equal(parsed.enabled, false);
    assert.equal(parsed.mode, 'ultimate');
    assert.equal(parsed.preset, 'complete');
    assert.equal(Object.values(parsed.features).every((value) => value === true), true);
  }
});

test('ordinary and null-prototype objects remain valid across VM realm boundaries', () => {
  const crossRealmSetting = vm.runInNewContext(`({
    enabled: true,
    preset: 'custom',
    features: { contextMenu: false }
  })`);
  const crossRealmClassInstance = vm.runInNewContext(`new (class DomainSetting {
    constructor() {
      this.enabled = true;
      this.preset = 'custom';
    }
  })()`);
  const crossRealmNullPrototype = vm.runInNewContext(`Object.assign(Object.create(null), {
    enabled: false,
    mode: 'lite'
  })`);
  const parsedByNode = shared.parseDomainSetting(crossRealmSetting);
  const parsedCrossRealmClass = shared.parseDomainSetting(crossRealmClassInstance);
  const parsedNullPrototype = shared.parseDomainSetting(crossRealmNullPrototype);
  const browserShared = loadBrowserShared();
  const parsedByBrowserVm = browserShared.parseDomainSetting({
    enabled: true,
    preset: 'custom',
    features: { contextMenu: false }
  });
  const parsedClassByBrowserVm = browserShared.parseDomainSetting(new (class DomainSetting {
    constructor() {
      this.enabled = true;
    }
  })());
  const parsedNullPrototypeByBrowserVm = browserShared.parseDomainSetting(
    Object.assign(Object.create(null), { enabled: true })
  );

  assert.equal(parsedByNode.enabled, true);
  assert.equal(parsedByNode.features.contextMenu, false);
  assert.equal(parsedCrossRealmClass.enabled, false);
  assert.equal(parsedCrossRealmClass.preset, 'complete');
  assert.equal(parsedNullPrototype.enabled, false);
  assert.equal(parsedNullPrototype.mode, 'lite');
  assert.equal(parsedNullPrototype.features.ultimateCss, false);
  assert.equal(parsedByBrowserVm.enabled, true);
  assert.equal(parsedByBrowserVm.features.contextMenu, false);
  assert.equal(parsedClassByBrowserVm.enabled, false);
  assert.equal(parsedClassByBrowserVm.preset, 'complete');
  assert.equal(parsedNullPrototypeByBrowserVm.enabled, true);
});

test('unknown preset falls back safely and normalization does not mutate the input map', () => {
  const input = {
    'lite.example': { enabled: true, mode: 'lite' },
    'invalid-lite.example': { enabled: true, mode: 'lite', preset: 'future-preset' },
    'invalid.example': { enabled: false, mode: 'future-mode', preset: 'future-preset' }
  };

  const normalized = shared.normalizeDomainSettings(input);

  assert.equal(normalized['lite.example'].preset, 'custom');
  assert.equal(normalized['lite.example'].features.ultimateCss, false);
  assert.equal(normalized['invalid-lite.example'].preset, 'custom');
  assert.equal(normalized['invalid-lite.example'].features.ultimateCss, false);
  assert.equal(normalized['invalid.example'].mode, 'ultimate');
  assert.equal(normalized['invalid.example'].preset, 'complete');
  assert.equal(Object.values(normalized['invalid.example'].features).every((value) => value === true), true);
  assert.equal(input['invalid.example'].mode, 'future-mode');
  assert.equal(input['invalid.example'].preset, 'future-preset');
});

test('domain map normalization rejects arrays and safely preserves __proto__ as data', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(shared.normalizeDomainSettings([]))), {});

  const domainSettings = JSON.parse('{"__proto__":true,"safe.example":false}');
  const normalized = shared.normalizeDomainSettings(domainSettings);
  const crossRealmNormalized = shared.normalizeDomainSettings(
    vm.runInNewContext(`({ "vm.example": { enabled: true } })`)
  );

  assert.equal(Object.getPrototypeOf(normalized), null);
  assert.equal(Object.hasOwn(normalized, '__proto__'), true);
  assert.equal(normalized.__proto__.enabled, true);
  assert.equal(normalized['safe.example'].enabled, false);
  assert.equal(crossRealmNormalized['vm.example'].enabled, true);
});
