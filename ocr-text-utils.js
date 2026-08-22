const RIGHT_CLICK_ON_WEB_OCR_TEXT_UTILS = (() => {
  'use strict';

  const RULE_NAMES = Object.freeze([
    'removeZeroWidthChars',
    'normalizeSpaces',
    'normalizePunctuationSpacing',
    'joinHyphenatedLines',
    'joinWrappedParagraphs',
    'collapseBlankLines'
  ]);
  const DEFAULT_CLEANUP_PLAN = Object.freeze({
    removeZeroWidthChars: false,
    normalizeSpaces: false,
    normalizePunctuationSpacing: false,
    joinHyphenatedLines: false,
    joinWrappedParagraphs: false,
    collapseBlankLines: false
  });

  function asText(value) {
    return typeof value === 'string' ? value : '';
  }

  function isCodeLikeLine(line) {
    return /^\s*(?:```|~~~|\t| {4})/.test(line) || line.includes('`');
  }

  function isUrlLine(line) {
    return /(?:https?:\/\/|www\.)\S/i.test(line);
  }

  function isStructuralLine(line) {
    return !line.trim() || isCodeLikeLine(line) || isUrlLine(line) ||
      /^\s*(?:[-*+]|(?:\d+|[A-Za-z])[.)])\s+/.test(line) ||
      /^\s*(?:>|#{1,6}\s|[-*_]{3,}\s*$)/.test(line);
  }

  function normalizeLineEndings(text) {
    return text.replace(/\r\n?/g, '\n');
  }

  function normalizeSpaces(value) {
    return normalizeLineEndings(asText(value)).split('\n').map((line) => {
      if (isCodeLikeLine(line)) return line;
      return line.replace(/[\t\f\v ]+/g, ' ');
    }).join('\n');
  }

  function collapseBlankLines(value) {
    return normalizeLineEndings(asText(value)).replace(/\n(?:[ \t]*\n){2,}/g, '\n\n');
  }

  function joinHyphenatedLines(value) {
    const lines = normalizeLineEndings(asText(value)).split('\n');
    const joined = [];
    for (let index = 0; index < lines.length; index += 1) {
      const current = lines[index];
      const next = lines[index + 1];
      if (next !== undefined && !isStructuralLine(current) && !isStructuralLine(next) &&
          /[A-Za-z]-$/.test(current) && /^[a-z]/.test(next)) {
        joined.push(current.slice(0, -1) + next);
        index += 1;
      } else {
        joined.push(current);
      }
    }
    return joined.join('\n');
  }

  function joinWrappedParagraphs(value) {
    const lines = normalizeLineEndings(asText(value)).split('\n');
    const joined = [];
    for (let index = 0; index < lines.length; index += 1) {
      const current = lines[index];
      const next = lines[index + 1];
      if (next !== undefined && !isStructuralLine(current) && !isStructuralLine(next) &&
          !/[.!?。！？:;]$/.test(current.trim()) && !/-$/.test(current.trim())) {
        joined.push(`${current.trimEnd()} ${next.trimStart()}`);
        index += 1;
      } else {
        joined.push(current);
      }
    }
    return joined.join('\n');
  }

  function normalizePunctuationSpacing(value) {
    return normalizeLineEndings(asText(value)).split('\n').map((line) => {
      if (isCodeLikeLine(line) || isUrlLine(line)) return line;
      const withoutLeadingSpaces = line.replace(/\s+([,!.?;:。！？])/g, '$1');
      return withoutLeadingSpaces.replace(/([A-Za-z0-9])([,!?;:])(?=[A-Za-z])/g, '$1$2 ');
    }).join('\n');
  }

  function removeZeroWidthChars(value) {
    return asText(value).replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/g, '');
  }

  function applyCleanupPlan(value, plan = DEFAULT_CLEANUP_PLAN) {
    const source = asText(value);
    const settings = plan && typeof plan === 'object' ? plan : DEFAULT_CLEANUP_PLAN;
    let text = source;
    const appliedRules = [];
    const functions = {
      removeZeroWidthChars,
      normalizeSpaces,
      normalizePunctuationSpacing,
      joinHyphenatedLines,
      joinWrappedParagraphs,
      collapseBlankLines
    };
    for (const name of RULE_NAMES) {
      if (settings[name] !== true) continue;
      const cleaned = functions[name](text);
      if (cleaned !== text) appliedRules.push(name);
      text = cleaned;
    }
    return Object.freeze({ text, appliedRules: Object.freeze(appliedRules) });
  }

  return Object.freeze({
    RULE_NAMES,
    DEFAULT_CLEANUP_PLAN,
    normalizeSpaces,
    collapseBlankLines,
    joinWrappedParagraphs,
    joinHyphenatedLines,
    normalizePunctuationSpacing,
    removeZeroWidthChars,
    applyCleanupPlan
  });
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RIGHT_CLICK_ON_WEB_OCR_TEXT_UTILS;
} else if (typeof globalThis !== 'undefined') {
  globalThis.RIGHT_CLICK_ON_WEB_OCR_TEXT_UTILS = RIGHT_CLICK_ON_WEB_OCR_TEXT_UTILS;
}
