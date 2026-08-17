'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveTheme, VALID_THEMES, DEFAULT_THEME } = require('../../shared.js');

test('resolveTheme: 유효한 테마 값은 그대로 반환', () => {
  assert.equal(resolveTheme('dark'), 'dark');
  assert.equal(resolveTheme('neon'), 'neon');
  assert.equal(resolveTheme('light'), 'light');
});

test('resolveTheme: 알 수 없는 값은 기본값으로 폴백', () => {
  assert.equal(resolveTheme('purple'), DEFAULT_THEME);
  assert.equal(resolveTheme(''), DEFAULT_THEME);
  assert.equal(resolveTheme(null), DEFAULT_THEME);
  assert.equal(resolveTheme(undefined), DEFAULT_THEME);
  assert.equal(resolveTheme(42), DEFAULT_THEME);
  assert.equal(resolveTheme({}), DEFAULT_THEME);
});

test('resolveTheme: 잘못된 타입은 기본값', () => {
  assert.equal(resolveTheme(['dark']), DEFAULT_THEME);
  assert.equal(resolveTheme({ value: 'neon' }), DEFAULT_THEME);
});

test('VALID_THEMES: 3개 값이 동결된 배열로 노출', () => {
  assert.ok(Array.isArray(VALID_THEMES));
  assert.equal(VALID_THEMES.length, 3);
  assert.deepEqual([...VALID_THEMES], ['dark', 'neon', 'light']);
});

test('VALID_THEMES: 동결되어 직접 변경 불가', () => {
  assert.ok(Object.isFrozen(VALID_THEMES));
  assert.throws(() => { VALID_THEMES.push('rainbow'); }, TypeError);
});

test('DEFAULT_THEME: dark', () => {
  assert.equal(DEFAULT_THEME, 'dark');
});