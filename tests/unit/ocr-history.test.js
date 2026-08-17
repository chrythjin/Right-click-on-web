'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const HISTORY = require(path.join(root, 'ocr-history.js'));

function entry(overrides = {}) {
  return {
    id: 'ocr-entry-1',
    text: '최종 편집 텍스트',
    hostname: 'example.com',
    savedAt: 1_000_000,
    ...overrides
  };
}

test('history helper retains only the entry allowlist and rejects malformed or excessive values', () => {
  const normalized = HISTORY.normalizeEntry({
    ...entry(), imageUrl: 'data:image/png;base64,private', rawText: '원본', unknown: true
  }, 1_000_001);
  assert.deepEqual(normalized, entry());
  assert.equal(HISTORY.normalizeEntry(entry({ hostname: 'https://private.example/path' }), 1_000_001), null);
  assert.equal(HISTORY.normalizeEntry(entry({ text: 'x'.repeat(HISTORY.MAX_TEXT_LENGTH + 1) }), 1_000_001), null);
  assert.equal(HISTORY.normalizeEntry(entry({ savedAt: 1_000_001 - HISTORY.MAX_AGE_MS - 1 }), 1_000_001), null);
});

test('history helper uses deterministic UTF-8 bytes and enforces count, TTL, and byte caps', () => {
  assert.equal(HISTORY.utf8ByteLength('A가😀'), 8);
  const now = 10_000_000;
  const many = Array.from({ length: HISTORY.MAX_ENTRIES + 4 }, (_, index) => entry({
    id: `ocr-count-${index}`,
    savedAt: now - index
  }));
  assert.equal(HISTORY.retainHistory(many, now).length, HISTORY.MAX_ENTRIES);
  const oversized = Array.from({ length: 10 }, (_, index) => entry({
    id: `ocr-byte-${index}`,
    text: '가'.repeat(12_000),
    savedAt: now - index
  }));
  const retained = HISTORY.retainHistory(oversized, now);
  assert.ok(HISTORY.historyByteLength(retained) <= HISTORY.MAX_HISTORY_BYTES);
  assert.ok(retained.length < oversized.length);
});

test('history search matches sanitized stored text and hostname locally', () => {
  const entries = [
    entry({ id: 'ocr-a', text: '회의 메모', hostname: 'docs.example.com' }),
    entry({ id: 'ocr-b', text: 'other', hostname: 'search.example.com' })
  ];
  assert.deepEqual(HISTORY.searchHistory(entries, '메모', 1_000_001).map((item) => item.id), ['ocr-a']);
  assert.deepEqual(HISTORY.searchHistory(entries, 'SEARCH', 1_000_001).map((item) => item.id), ['ocr-b']);
});

test('history source and manifest declare a local-only runtime helper without sync writes', () => {
  const source = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.ok(manifest.background.scripts.includes('ocr-history.js'));
  assert.ok(source.includes("SHARED.storageSet(chrome.storage.local, { [OCR_HISTORY.OCR_HISTORY_KEY]: entries })"));
  assert.equal(source.includes('safeSyncSet({ [OCR_HISTORY.OCR_HISTORY_KEY]'), false);
  assert.equal(source.includes('storage.sync, { [OCR_HISTORY.OCR_HISTORY_KEY]'), false);
});
