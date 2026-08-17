'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');

function readContentMain() {
  return fs.readFileSync(path.join(root, 'content-main.js'), 'utf8');
}

function readPopupJs() {
  return fs.readFileSync(path.join(root, 'popup.js'), 'utf8');
}

function readManifest() {
  return JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
}

// Extract the BLOCKED_EVENT_NAMES array literal from content-main.js source.
// We parse the source text rather than executing it, because content-main.js
// patches live prototypes (EventTarget, Element) and must not run in Node.
function extractBlockedEventNames(source) {
  const match = source.match(/BLOCKED_EVENT_NAMES\s*=\s*Object\.freeze\(\s*\[([\s\S]*?)\]\s*\)/);
  if (!match) {
    throw new Error('BLOCKED_EVENT_NAMES array not found in content-main.js');
  }
  const items = match[1]
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => item.replace(/^['"]|['"]$/g, ''));
  return items;
}

// Extract and evaluate computeMainWorldNotice from popup.js source.
// We isolate the function body so the test does not depend on browser globals.
function loadComputeMainWorldNotice() {
  const source = readPopupJs();
  const match = source.match(/function computeMainWorldNotice\([\s\S]*?\n\}/);
  if (!match) {
    throw new Error('computeMainWorldNotice function not found in popup.js');
  }
  const fnSrc = match[0];
  const context = vm.createContext({});
  vm.runInContext(`${fnSrc}; this.computeMainWorldNotice = computeMainWorldNotice;`, context);
  return context.computeMainWorldNotice;
}

// ---- MAIN event allowlist drift tests ----

test('MAIN blocked-event allowlist is exactly contextmenu, selectstart, dragstart', () => {
  const names = extractBlockedEventNames(readContentMain());
  assert.deepEqual(names, ['contextmenu', 'selectstart', 'dragstart']);
});

test('MAIN blocked-event allowlist rejects drift (no copy/cut/paste/dragover/drop/mousedown/mouseup/touch*)', () => {
  const names = new Set(extractBlockedEventNames(readContentMain()));
  const forbidden = [
    'copy', 'cut', 'paste',
    'dragover', 'drop',
    'mousedown', 'mouseup',
    'touchstart', 'touchend', 'touchmove',
    'keydown', 'keyup', 'keypress'
  ];
  for (const event of forbidden) {
    assert.equal(names.has(event), false, `MAIN allowlist must not include "${event}"`);
  }
});

test('content-main.js does not read chrome.storage or per-domain settings', () => {
  const source = readContentMain();
  // Strip comments before checking for forbidden references, because
  // the header documentation intentionally names the forbidden APIs to
  // explain why they must not be used.
  const codeOnly = source.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/chrome\.storage/.test(codeOnly), false, 'content-main.js must not reference chrome.storage');
  assert.equal(/chrome\.runtime/.test(codeOnly), false, 'content-main.js must not reference chrome.runtime');
  assert.equal(/domainSettings/.test(codeOnly), false, 'content-main.js must not reference domainSettings');
  assert.equal(/isDomainEnabled/.test(codeOnly), false, 'content-main.js must not reference isDomainEnabled');
  assert.equal(/resolveDomainKey/.test(codeOnly), false, 'content-main.js must not reference resolveDomainKey');
});

test('content-main.js header does not present reload alone as sufficient for full OFF', () => {
  const source = readContentMain();
  assert.equal(/or reloading the tab/.test(source), false,
    'must not present reload as an alternative to disabling for full OFF');
  assert.equal(/reloading the tab\s*$/.test(source), false,
    'must not end a full-OFF sentence with reload alone');
  assert.match(source, /AND reloading the tab/,
    'must state complete restoration requires disable AND reload');
  assert.match(source, /re-appear after reload while the/,
    'must state MAIN patches re-appear after reload while enabled');
});

test('manifest.json keeps content-main.js as first MAIN-world entry', () => {
  const manifest = readManifest();
  const contentScripts = manifest.content_scripts;
  assert.ok(Array.isArray(contentScripts) && contentScripts.length >= 2);
  const main = contentScripts[0];
  assert.equal(main.world, 'MAIN');
  assert.equal(main.js[0], 'content-main.js');
  assert.equal(main.run_at, 'document_start');
  assert.equal(main.all_frames, true);
});

// ---- popup reload messaging tests ----

test('computeMainWorldNotice hides notice when ON and Ultimate (MAIN patches match desired state)', () => {
  const fn = loadComputeMainWorldNotice();
  const result = fn({ hostname: 'example.com', effectiveEnabled: true, effectiveMode: 'ultimate' }, 'lite');
  assert.equal(result.visible, false);
  assert.equal(result.text, '');
});

test('computeMainWorldNotice shows reload hint when effective OFF', () => {
  const fn = loadComputeMainWorldNotice();
  const result = fn({ hostname: 'example.com', effectiveEnabled: false, effectiveMode: 'ultimate' }, 'lite');
  assert.equal(result.visible, true);
  assert.match(result.text, /MAIN-world/);
  assert.match(result.text, /ISOLATED/);
  assert.match(result.text, /확장을 비활성화/);
  assert.match(result.text, /새로고침/);
});

test('computeMainWorldNotice OFF text rejects false reload-only restoration claim', () => {
  const fn = loadComputeMainWorldNotice();
  const result = fn({ hostname: 'example.com', effectiveEnabled: false, effectiveMode: 'ultimate' }, 'lite');
  assert.equal(/완전한 차단 복원은 새로고침 후 적용/.test(result.text), false,
    'must not claim reload alone fully restores blocking');
  assert.equal(/새로고침 후 적용됩니다\.?$/.test(result.text), false,
    'must not imply reload alone is sufficient for complete restoration');
});

test('computeMainWorldNotice shows reload hint when Lite mode active', () => {
  const fn = loadComputeMainWorldNotice();
  const result = fn({ hostname: 'example.com', effectiveEnabled: true, effectiveMode: 'lite' }, 'lite');
  assert.equal(result.visible, true);
  assert.match(result.text, /새로고침/);
  assert.match(result.text, /MAIN-world/);
  assert.match(result.text, /ISOLATED/);
  assert.match(result.text, /확장이 켜져 있는 한/);
});

test('computeMainWorldNotice hides notice when hostname is empty (non-http page)', () => {
  const fn = loadComputeMainWorldNotice();
  const result = fn({ hostname: '', effectiveEnabled: false, effectiveMode: 'ultimate' }, 'lite');
  assert.equal(result.visible, false);
  assert.equal(result.text, '');
});

test('popup reload messaging never promises immediate full restoration', () => {
  const fn = loadComputeMainWorldNotice();
  const offResult = fn({ hostname: 'example.com', effectiveEnabled: false, effectiveMode: 'ultimate' }, 'lite');
  const liteResult = fn({ hostname: 'example.com', effectiveEnabled: true, effectiveMode: 'lite' }, 'lite');
  for (const result of [offResult, liteResult]) {
    assert.equal(/즉시 완전 복원|즉시 제거|immediately remove|immediate full/.test(result.text), false,
      'notice must not promise immediate full restoration');
  }
});

test('popup reload messaging never claims reload alone fully restores or undoes MAIN patches', () => {
  const fn = loadComputeMainWorldNotice();
  const offResult = fn({ hostname: 'example.com', effectiveEnabled: false, effectiveMode: 'ultimate' }, 'lite');
  const liteResult = fn({ hostname: 'example.com', effectiveEnabled: true, effectiveMode: 'lite' }, 'lite');
  const falsePhrases = [
    /완전한 차단 복원은 새로고침/,
    /새로고침 후 적용됩니다\.?$/,
    /새로고침만으로.*완전/,
    /reload.*fully.*restor/i,
    /reload.*undoes.*MAIN/i
  ];
  for (const result of [offResult, liteResult]) {
    for (const phrase of falsePhrases) {
      assert.equal(phrase.test(result.text), false,
        `notice must not claim reload alone fully restores: matched ${phrase}`);
    }
  }
});

test('popup.js source contains mainWorldNotice element wiring and renderMainWorldNotice call', () => {
  const source = readPopupJs();
  assert.match(source, /mainWorldNotice:\s*document\.getElementById\('mainWorldNotice'\)/);
  assert.match(source, /renderMainWorldNotice\(\)/);
  assert.match(source, /computeMainWorldNotice/);
});

test('popup.html contains the mainWorldNotice element', () => {
  const html = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
  assert.match(html, /id="mainWorldNotice"/);
  assert.match(html, /class="main-world-notice/);
});