# Task 2.6 Local Diagnostic Report

Date: 2026-08-15

## Delivered

- Added a Korean-first popup action that copies a local diagnostic report for the current tab.
- Reused `__rightClickOnWebStats` through an ISOLATED-world content-script message handler because the popup cannot directly access that DOM-world bridge.
- The report serializer creates a new object from strict allowlists only: version, resolved hostname, resolution source, matched domain, mode, preset, canonical enabled features, and explicitly named numeric counters.
- Bridge absence and clipboard-write failures show accessible Korean status text with a refresh or permission hint.

## Privacy Boundary

- The report never accepts or emits a full URL, URL path/query/hash, page or DOM text, OCR text/results, clipboard contents, storage dumps, unknown feature keys, unknown counters, or nested bridge objects.
- Canonical feature ordering follows `SHARED.FEATURE_KEYS`; invalid counter values normalize to zero.

## Verification

- `node --test tests/unit/popup-diagnostic-report.test.js` passed: 8 tests.
- `node --test tests/unit/*.test.js` passed: 264 tests.
- `node --check popup.js` and `node --check content.js` passed.
- `scripts/verify.ps1` passed.
- `git diff --check` passed.
- LSP diagnostics were clean for `content.js`, `popup.js`, and the new unit test. HTML/CSS diagnostics were unavailable because the locally configured Biome server is not installed and installation was previously declined.

## Manual QA

- No live unpacked Chrome/Chrome DevTools target was connected, so popup-click manual QA was not performed. This preserves the existing separate manual-QA blocker rather than claiming a browser verification that did not occur.
