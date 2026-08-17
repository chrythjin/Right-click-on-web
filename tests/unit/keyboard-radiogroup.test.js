'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MODE_LITE,
  MODE_ULTIMATE,
  getNextModeFromKeydown
} = require('../../keyboard-utils.js');

test('getNextModeFromKeydown: ArrowRight moves from Lite to Ultimate', () => {
  assert.strictEqual(getNextModeFromKeydown(MODE_LITE, 'ArrowRight'), MODE_ULTIMATE);
});

test('getNextModeFromKeydown: ArrowLeft moves from Ultimate to Lite', () => {
  assert.strictEqual(getNextModeFromKeydown(MODE_ULTIMATE, 'ArrowLeft'), MODE_LITE);
});

test('getNextModeFromKeydown: ArrowDown moves from Lite to Ultimate', () => {
  assert.strictEqual(getNextModeFromKeydown(MODE_LITE, 'ArrowDown'), MODE_ULTIMATE);
});

test('getNextModeFromKeydown: ArrowUp moves from Ultimate to Lite', () => {
  assert.strictEqual(getNextModeFromKeydown(MODE_ULTIMATE, 'ArrowUp'), MODE_LITE);
});

test('getNextModeFromKeydown: Home key always selects Lite', () => {
  assert.strictEqual(getNextModeFromKeydown(MODE_ULTIMATE, 'Home'), MODE_LITE);
  assert.strictEqual(getNextModeFromKeydown(MODE_LITE, 'Home'), MODE_LITE);
});

test('getNextModeFromKeydown: End key always selects Ultimate', () => {
  assert.strictEqual(getNextModeFromKeydown(MODE_LITE, 'End'), MODE_ULTIMATE);
  assert.strictEqual(getNextModeFromKeydown(MODE_ULTIMATE, 'End'), MODE_ULTIMATE);
});

test('getNextModeFromKeydown: unrecognized keys return null', () => {
  assert.strictEqual(getNextModeFromKeydown(MODE_LITE, 'Tab'), null);
  assert.strictEqual(getNextModeFromKeydown(MODE_LITE, 'Enter'), null);
  assert.strictEqual(getNextModeFromKeydown(MODE_LITE, 'Space'), null);
});

test('getNextModeFromKeydown: wraps around with ArrowRight from Ultimate', () => {
  assert.strictEqual(getNextModeFromKeydown(MODE_ULTIMATE, 'ArrowRight'), MODE_LITE);
});

test('getNextModeFromKeydown: wraps around with ArrowLeft from Lite', () => {
  assert.strictEqual(getNextModeFromKeydown(MODE_LITE, 'ArrowLeft'), MODE_ULTIMATE);
});
