const RIGHT_CLICK_ON_WEB_OCR_HISTORY = (() => {
  'use strict';

  const OCR_HISTORY_ENABLED_KEY = 'ocrHistoryEnabled';
  const OCR_HISTORY_KEY = 'ocrHistory';
  const MAX_ENTRIES = 20;
  const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
  const MAX_HISTORY_BYTES = 64 * 1024;
  const MAX_TEXT_LENGTH = 12000;
  const MAX_HOSTNAME_LENGTH = 253;
  const MAX_ID_LENGTH = 48;

  function utf8ByteLength(value) {
    const text = typeof value === 'string' ? value : '';
    let bytes = 0;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if (code <= 0x7f) bytes += 1;
      else if (code <= 0x7ff) bytes += 2;
      else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length &&
          text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    }
    return bytes;
  }

  function isSafeHostname(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_HOSTNAME_LENGTH &&
      /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(value) && !value.includes('..');
  }

  function normalizeEntry(value, now = Date.now()) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const { id, text, hostname, savedAt } = value;
    if (typeof id !== 'string' || id.length === 0 || id.length > MAX_ID_LENGTH || !/^[a-z0-9-]+$/i.test(id) ||
        typeof text !== 'string' || text.length === 0 || text.length > MAX_TEXT_LENGTH ||
        !isSafeHostname(hostname) || !Number.isInteger(savedAt) || savedAt <= 0 || savedAt > now + 60 * 1000 ||
        now - savedAt > MAX_AGE_MS) {
      return null;
    }
    return { id, text, hostname: hostname.toLowerCase(), savedAt };
  }

  function historyByteLength(entries) {
    return utf8ByteLength(JSON.stringify({ [OCR_HISTORY_KEY]: entries }));
  }

  function retainHistory(value, now = Date.now()) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const retained = [];
    for (const rawEntry of value) {
      const entry = normalizeEntry(rawEntry, now);
      if (entry && !seen.has(entry.id)) {
        seen.add(entry.id);
        retained.push(entry);
      }
    }
    retained.sort((left, right) => right.savedAt - left.savedAt || right.id.localeCompare(left.id));
    const limited = retained.slice(0, MAX_ENTRIES);
    while (limited.length > 0 && historyByteLength(limited) > MAX_HISTORY_BYTES) {
      limited.pop();
    }
    return limited;
  }

  function createEntry({ id, text, hostname, savedAt }, now = Date.now()) {
    return normalizeEntry({ id, text, hostname, savedAt }, now);
  }

  function searchHistory(value, query, now = Date.now()) {
    const normalizedQuery = typeof query === 'string' ? query.trim().toLocaleLowerCase() : '';
    return retainHistory(value, now).filter((entry) => !normalizedQuery ||
      entry.text.toLocaleLowerCase().includes(normalizedQuery) ||
      entry.hostname.toLocaleLowerCase().includes(normalizedQuery));
  }

  return Object.freeze({
    OCR_HISTORY_ENABLED_KEY,
    OCR_HISTORY_KEY,
    MAX_ENTRIES,
    MAX_AGE_MS,
    MAX_HISTORY_BYTES,
    MAX_TEXT_LENGTH,
    utf8ByteLength,
    historyByteLength,
    normalizeEntry,
    retainHistory,
    createEntry,
    searchHistory
  });
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RIGHT_CLICK_ON_WEB_OCR_HISTORY;
} else if (typeof globalThis !== 'undefined') {
  globalThis.RIGHT_CLICK_ON_WEB_OCR_HISTORY = RIGHT_CLICK_ON_WEB_OCR_HISTORY;
}
