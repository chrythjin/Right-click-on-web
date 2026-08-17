'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const KU = require('../../keyboard-utils.js');

const MIN_SIZE = 10;
const VP_W = 1920;
const VP_H = 1080;

test('clampCropRect: within viewport returns unchanged', () => {
  const rect = { x: 100, y: 100, width: 200, height: 150 };
  const result = KU.clampCropRect(rect, VP_W, VP_H, MIN_SIZE);
  assert.deepEqual(result, rect);
});

test('clampCropRect: right edge overflow clamped to width', () => {
  const rect = { x: 1800, y: 100, width: 200, height: 150 };
  const result = KU.clampCropRect(rect, VP_W, VP_H, MIN_SIZE);
  assert.equal(result.x, 1800);
  assert.equal(result.width, Math.max(MIN_SIZE, VP_W - 1800));
  assert.equal(result.y, 100);
  assert.equal(result.height, 150);
});

test('clampCropRect: bottom edge overflow clamped to height', () => {
  const rect = { x: 100, y: 1000, width: 200, height: 200 };
  const result = KU.clampCropRect(rect, VP_W, VP_H, MIN_SIZE);
  assert.equal(result.y, 1000);
  assert.equal(result.height, Math.max(MIN_SIZE, VP_H - 1000));
  assert.equal(result.x, 100);
  assert.equal(result.width, 200);
});

test('clampCropRect: negative origin clamped to 0', () => {
  const rect = { x: -50, y: -30, width: 200, height: 150 };
  const result = KU.clampCropRect(rect, VP_W, VP_H, MIN_SIZE);
  assert.equal(result.x, 0);
  assert.equal(result.y, 0);
  assert.equal(result.width, 150);
  assert.equal(result.height, 120);
});

test('clampCropRect: width under minSize raised to minSize', () => {
  const rect = { x: 100, y: 100, width: 5, height: 100 };
  const result = KU.clampCropRect(rect, VP_W, VP_H, MIN_SIZE);
  assert.equal(result.width, MIN_SIZE);
});

test('clampCropRect: height under minSize raised to minSize', () => {
  const rect = { x: 100, y: 100, width: 100, height: 5 };
  const result = KU.clampCropRect(rect, VP_W, VP_H, MIN_SIZE);
  assert.equal(result.height, MIN_SIZE);
});

test('clampCropRect: x overflow past viewport max clamped', () => {
  const rect = { x: 2000, y: 100, width: 200, height: 150 };
  const result = KU.clampCropRect(rect, VP_W, VP_H, MIN_SIZE);
  assert.equal(result.x, VP_W - MIN_SIZE);
  assert.equal(result.width, MIN_SIZE);
});

test('clampCropRect: y overflow past viewport max clamped', () => {
  const rect = { x: 100, y: 1200, width: 200, height: 150 };
  const result = KU.clampCropRect(rect, VP_W, VP_H, MIN_SIZE);
  assert.equal(result.y, VP_H - MIN_SIZE);
  assert.equal(result.height, MIN_SIZE);
});

test('clampCropRect: returns null for null rect', () => {
  assert.equal(KU.clampCropRect(null, VP_W, VP_H, MIN_SIZE), null);
});

test('clampCropRect: returns null for viewport smaller than minSize', () => {
  assert.equal(KU.clampCropRect({ x: 0, y: 0, width: 200, height: 150 }, 5, 5, MIN_SIZE), null);
});

test('clampCropRect: returns null for Infinity viewport width', () => {
  assert.equal(KU.clampCropRect({ x: 0, y: 0, width: 100, height: 100 }, Infinity, VP_H, MIN_SIZE), null);
});

test('clampCropRect: returns null for NaN viewport', () => {
  assert.equal(KU.clampCropRect({ x: 0, y: 0, width: 100, height: 100 }, NaN, VP_H, MIN_SIZE), null);
});

test('clampCropRect: returns null for negative minSize', () => {
  assert.equal(KU.clampCropRect({ x: 100, y: 100, width: 200, height: 150 }, VP_W, VP_H, -5), null);
});

test('clampCropRect: uses defaults when viewport/minSize not provided', () => {
  const rect = { x: 100, y: 100, width: 200, height: 150 };
  const result = KU.clampCropRect(rect);
  assert.deepEqual(result, rect);
});

test('moveCropRect: translates rect within viewport', () => {
  const rect = { x: 100, y: 100, width: 200, height: 150 };
  const result = KU.moveCropRect(rect, 50, 30, VP_W, VP_H, MIN_SIZE);
  assert.deepEqual(result, { x: 150, y: 130, width: 200, height: 150 });
});

test('moveCropRect: returns null for null rect', () => {
  assert.equal(KU.moveCropRect(null, 50, 30, VP_W, VP_H, MIN_SIZE), null);
});

test('moveCropRect: negative offset from origin keeps width and height unchanged', () => {
  const rect = { x: 0, y: 0, width: 200, height: 150 };
  const result = KU.moveCropRect(rect, -100, -50, VP_W, VP_H, MIN_SIZE);
  assert.equal(result.x, 0);
  assert.equal(result.y, 0);
  assert.equal(result.width, 200);
  assert.equal(result.height, 150);
});

test('moveCropRect: right-edge approach keeps width and height unchanged', () => {
  const rect = { x: 1700, y: 900, width: 200, height: 150 };
  const result = KU.moveCropRect(rect, 50, 50, VP_W, VP_H, MIN_SIZE);
  assert.equal(result.x, VP_W - 200);
  assert.equal(result.y, VP_H - 150);
  assert.equal(result.width, 200);
  assert.equal(result.height, 150);
});

test('moveCropRect: uses default viewport when not provided', () => {
  const rect = { x: 100, y: 100, width: 200, height: 150 };
  const result = KU.moveCropRect(rect, 10, 20);
  assert.equal(result.x, 110);
  assert.equal(result.y, 120);
  assert.equal(result.width, 200);
  assert.equal(result.height, 150);
});

test('moveCropRect: rejects non-finite movement deltas', () => {
  const rect = { x: 100, y: 100, width: 200, height: 150 };
  assert.equal(KU.moveCropRect(rect, NaN, 10, VP_W, VP_H, MIN_SIZE), null);
  assert.equal(KU.moveCropRect(rect, 10, Infinity, VP_W, VP_H, MIN_SIZE), null);
});

test('resizeCropRect: expands width and height', () => {
  const rect = { x: 100, y: 100, width: 200, height: 150 };
  const result = KU.resizeCropRect(rect, 20, 30, VP_W, VP_H, MIN_SIZE);
  assert.deepEqual(result, { x: 100, y: 100, width: 220, height: 180 });
});

test('resizeCropRect: shrinks width and height', () => {
  const rect = { x: 100, y: 100, width: 200, height: 150 };
  const result = KU.resizeCropRect(rect, -50, -40, VP_W, VP_H, MIN_SIZE);
  assert.deepEqual(result, { x: 100, y: 100, width: 150, height: 110 });
});

test('resizeCropRect: enforces minimum size on shrink', () => {
  const rect = { x: 100, y: 100, width: 200, height: 150 };
  const result = KU.resizeCropRect(rect, -500, -500, VP_W, VP_H, MIN_SIZE);
  assert.equal(result.width, MIN_SIZE);
  assert.equal(result.height, MIN_SIZE);
});

test('resizeCropRect: returns null for null rect', () => {
  assert.equal(KU.resizeCropRect(null, 20, 30, VP_W, VP_H, MIN_SIZE), null);
});

test('resizeCropRect: rejects non-finite resize deltas', () => {
  const rect = { x: 100, y: 100, width: 200, height: 150 };
  assert.equal(KU.resizeCropRect(rect, -Infinity, 10, VP_W, VP_H, MIN_SIZE), null);
  assert.equal(KU.resizeCropRect(rect, 10, NaN, VP_W, VP_H, MIN_SIZE), null);
});

test('initCropKeyboard: centered rect within viewport', () => {
  const result = KU.initCropKeyboard(VP_W, VP_H, 200, 150);
  assert.equal(result.x, Math.max(0, (VP_W - 200) / 2));
  assert.equal(result.y, Math.max(0, (VP_H - 150) / 2));
  assert.equal(result.width, 200);
  assert.equal(result.height, 150);
});

test('initCropKeyboard: returns null for viewport smaller than minSize', () => {
  assert.equal(KU.initCropKeyboard(5, 5), null);
});

test('initCropKeyboard: clamps init size to viewport', () => {
  const result = KU.initCropKeyboard(50, 40, 200, 150);
  assert.equal(result.width, 50);
  assert.equal(result.height, 40);
});

test('initCropKeyboard: returns null for Infinity viewport', () => {
  assert.equal(KU.initCropKeyboard(Infinity, Infinity), null);
});

test('initCropKeyboard: returns null for NaN viewport', () => {
  assert.equal(KU.initCropKeyboard(NaN, 1080), null);
});

test('isValidCropRect: valid rect returns true', () => {
  assert.equal(KU.isValidCropRect({ x: 100, y: 100, width: 200, height: 150 }, VP_W, VP_H, MIN_SIZE), true);
});

test('isValidCropRect: width under min returns false', () => {
  assert.equal(KU.isValidCropRect({ x: 100, y: 100, width: 5, height: 150 }, VP_W, VP_H, MIN_SIZE), false);
});

test('isValidCropRect: height under min returns false', () => {
  assert.equal(KU.isValidCropRect({ x: 100, y: 100, width: 200, height: 5 }, VP_W, VP_H, MIN_SIZE), false);
});

test('isValidCropRect: null returns false', () => {
  assert.equal(KU.isValidCropRect(null, VP_W, VP_H, MIN_SIZE), false);
});

test('isValidCropRect: non-finite values return false', () => {
  assert.equal(KU.isValidCropRect({ x: Infinity, y: 100, width: 200, height: 150 }, VP_W, VP_H, MIN_SIZE), false);
  assert.equal(KU.isValidCropRect({ x: 100, y: NaN, width: 200, height: 150 }, VP_W, VP_H, MIN_SIZE), false);
  assert.equal(KU.isValidCropRect({ x: 100, y: 100, width: Infinity, height: 150 }, VP_W, VP_H, MIN_SIZE), false);
});

test('isValidCropRect: x negative returns false', () => {
  assert.equal(KU.isValidCropRect({ x: -10, y: 100, width: 200, height: 150 }, VP_W, VP_H, MIN_SIZE), false);
});

test('isValidCropRect: y negative returns false', () => {
  assert.equal(KU.isValidCropRect({ x: 100, y: -10, width: 200, height: 150 }, VP_W, VP_H, MIN_SIZE), false);
});

test('isValidCropRect: right edge outside viewport returns false', () => {
  assert.equal(KU.isValidCropRect({ x: 1800, y: 100, width: 200, height: 150 }, VP_W, VP_H, MIN_SIZE), false);
});

test('isValidCropRect: bottom edge outside viewport returns false', () => {
  assert.equal(KU.isValidCropRect({ x: 100, y: 1000, width: 200, height: 200 }, VP_W, VP_H, MIN_SIZE), false);
});

test('isValidCropRect: rect exactly at viewport edge is valid', () => {
  assert.equal(KU.isValidCropRect({ x: 0, y: 0, width: VP_W, height: VP_H }, VP_W, VP_H, MIN_SIZE), true);
});

test('isValidCropRect: Infinity viewport returns false', () => {
  assert.equal(KU.isValidCropRect({ x: 100, y: 100, width: 200, height: 150 }, Infinity, Infinity, MIN_SIZE), false);
});

test('isValidCropRect: NaN viewport returns false', () => {
  assert.equal(KU.isValidCropRect({ x: 100, y: 100, width: 200, height: 150 }, NaN, 1080, MIN_SIZE), false);
});

test('isValidCropRect: zero viewport returns false', () => {
  assert.equal(KU.isValidCropRect({ x: 100, y: 100, width: 200, height: 150 }, 0, 1080, MIN_SIZE), false);
});

test('isValidCropRect: negative viewport returns false', () => {
  assert.equal(KU.isValidCropRect({ x: 100, y: 100, width: 200, height: 150 }, -100, 1080, MIN_SIZE), false);
});

test('isValidCropRect: viewport smaller than minSize returns false', () => {
  assert.equal(KU.isValidCropRect({ x: 0, y: 0, width: 5, height: 5 }, 5, 5, MIN_SIZE), false);
});

test('isValidCropRect: invalid minSize returns false', () => {
  assert.equal(KU.isValidCropRect({ x: 100, y: 100, width: 200, height: 150 }, VP_W, VP_H, Infinity), false);
  assert.equal(KU.isValidCropRect({ x: 100, y: 100, width: 200, height: 150 }, VP_W, VP_H, NaN), false);
  assert.equal(KU.isValidCropRect({ x: 100, y: 100, width: 200, height: 150 }, VP_W, VP_H, 0), false);
  assert.equal(KU.isValidCropRect({ x: 100, y: 100, width: 200, height: 150 }, VP_W, VP_H, -5), false);
});

test('isValidCropRect: uses 1920x1080 finite default for undefined viewport', () => {
  assert.equal(KU.isValidCropRect({ x: 100, y: 100, width: 200, height: 150 }, undefined, undefined, MIN_SIZE), true);
  assert.equal(KU.isValidCropRect({ x: -10, y: 100, width: 200, height: 150 }, undefined, undefined, MIN_SIZE), false);
  assert.equal(KU.isValidCropRect({ x: 2000, y: 100, width: 200, height: 150 }, undefined, undefined, MIN_SIZE), false);
  assert.equal(KU.isValidCropRect({ x: 100, y: 1200, width: 200, height: 150 }, undefined, undefined, MIN_SIZE), false);
});

test('isValidCropRect: explicit Infinity viewport returns false', () => {
  assert.equal(KU.isValidCropRect({ x: 100, y: 100, width: 200, height: 150 }, Infinity, Infinity, MIN_SIZE), false);
  assert.equal(KU.isValidCropRect({ x: 100, y: 100, width: 200, height: 150 }, Infinity, 1080, MIN_SIZE), false);
  assert.equal(KU.isValidCropRect({ x: 100, y: 100, width: 200, height: 150 }, 1920, Infinity, MIN_SIZE), false);
});

test('isValidCropRect: explicit NaN viewport returns false', () => {
  assert.equal(KU.isValidCropRect({ x: 100, y: 100, width: 200, height: 150 }, NaN, 1080, MIN_SIZE), false);
  assert.equal(KU.isValidCropRect({ x: 100, y: 100, width: 200, height: 150 }, 1920, NaN, MIN_SIZE), false);
  assert.equal(KU.isValidCropRect({ x: 100, y: 100, width: 200, height: 150 }, NaN, NaN, MIN_SIZE), false);
});

test('initCropKeyboard: NaN init dimensions normalize to defaults', () => {
  const result = KU.initCropKeyboard(VP_W, VP_H, NaN, NaN);
  assert.notEqual(result, null);
  assert.equal(Number.isFinite(result.x), true);
  assert.equal(Number.isFinite(result.y), true);
  assert.equal(Number.isFinite(result.width), true);
  assert.equal(Number.isFinite(result.height), true);
  assert.equal(KU.isValidCropRect(result, VP_W, VP_H, MIN_SIZE), true);
});

test('initCropKeyboard: Infinity init dimensions normalize to defaults', () => {
  const result = KU.initCropKeyboard(VP_W, VP_H, Infinity, Infinity);
  assert.notEqual(result, null);
  assert.equal(Number.isFinite(result.x), true);
  assert.equal(Number.isFinite(result.y), true);
  assert.equal(Number.isFinite(result.width), true);
  assert.equal(Number.isFinite(result.height), true);
  assert.equal(KU.isValidCropRect(result, VP_W, VP_H, MIN_SIZE), true);
});

test('initCropKeyboard: result is always isValidCropRect for normal viewport', () => {
  const result = KU.initCropKeyboard(VP_W, VP_H, 200, 150);
  assert.notEqual(result, null);
  assert.equal(KU.isValidCropRect(result, VP_W, VP_H, MIN_SIZE), true);
});
