# 20260814_AccessBaseline_Wave1-6_AccessibilityEnforcement

## Task
-wave-1-6-access-baseline: Implement WCAG accessibility fundamentals for popup/options/crop-overlay UI.

## Changes Made

### popup.html
- `sessionButton`: added `aria-pressed="false"` attribute
- Status/domain/mode cards: added `aria-atomic="true"` to live regions
- Mode radiogroup: added `tabindex="-1"` to Lite (inactive) and `tabindex="0"` to Ultimate (active) for roving tabindex pattern

### popup.js
- `sessionButton`: now syncs `aria-pressed` with `state.sessionActive` using `setAttribute`
- Added keyboard `keydown` handler for mode radiogroup with ArrowLeft/Right/Up/Down, Home, End support and roving tabindex focus management

### options.html
- `ocrResultPanel`: added `aria-atomic="true"`
- `options-global` status card: added `aria-atomic="true"`
- `siteList`: added `aria-atomic="true"`

### options.js
- `createDomainRow()`: delete button now gets `aria-label` with hostname: `setAttribute('aria-label', `'${hostname}' 설정 삭제`)`

### crop-overlay.js
- `handleKeydown`: enhanced with arrow keys (5px step, 20px with Shift), Enter to confirm crop, expanded Escape handling
- `tipElement`: added `aria-live="polite"` and `aria-atomic="true"`, added `.rcow-sr-instruction` span for screen reader announcements
- Enter key triggers full crop flow with OCR processing

### crop-overlay.css
- Added `@media (prefers-reduced-motion: reduce)` to disable animations/transitions
- Added `.rcow-sr-only` utility class for screen-reader-only content
- Added responsive adjustments for very small (320px) and large (2400px+) viewports

### popup.css
- Extended `@media (prefers-reduced-motion: reduce)` to cover all toggle and session buttons
- Added fluid width reflow at 680px+ viewport

### options.css
- Added `@media (prefers-reduced-motion: reduce)` with `animation-duration: 0.01ms` and `transition-duration: 0.01ms`
- Added fluid max-width at 900px+ viewport

### tests/unit/keyboard-radiogroup.test.js
- New test file for Lite/Ultimate roving tabindex keyboard navigation
- Tests: ArrowRight, ArrowLeft, ArrowDown, ArrowUp, Home, End, and unrecognized keys

## Verification
- `node --check` on popup.js, options.js, crop-overlay.js: all pass (no output = success)
- `node --test tests/unit/*.test.js`: 54 tests pass (47 original + 7 new)

## Notes
- No changes to background.js, content.js, shared.js, or manifest.json
- Korean UI preserved throughout
- Keyboard crop flow: Enter confirms, Escape cancels, arrows adjust (5px/20px step)
- Session button aria-pressed correctly synced with sessionActive state
