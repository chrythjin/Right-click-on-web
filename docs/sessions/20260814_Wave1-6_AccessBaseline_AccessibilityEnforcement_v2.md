# 20260814_Wave1-6_AccessBaseline_AccessibilityEnforcement_v2

## Task
-wave-1-6-access-baseline v2: Fix WCAG accessibility review findings for popup/options/crop-overlay UI.

## Rejection Findings Fixed

### 1. popup.html: syncUsage status semantics
- Added `role="status" aria-live="polite"` to `#syncUsage`

### 2. options.html: ocrResultStatus independent live region
- Added `role="status" aria-live="polite" aria-atomic="true"` to `#ocrResultStatus`
- Parent `ocrResultPanel` live region alone does not satisfy named dynamic status requirement

### 3. popup.js: render-time roving tabindex assignment
- After setting aria-checked, now also set tabindex=0 to active radio, tabindex=-1 to inactive
- Lines 225-226: `modeLite.setAttribute('tabindex', String(activeMode === SHARED.MODE_LITE ? 0 : -1))`

### 4. popup.js: guard active before setAttribute in keydown
- Added null guard: `if (active) { active.setAttribute('tabindex', '-1'); }`
- Prevents error when active is null

### 5. options.html template: initial radio ARIA/tabindex values
- Lite: `aria-checked="false" tabindex="-1"`
- Ultimate: `aria-checked="true" tabindex="0"`

### 6. options.js createSiteRow: roving tabindex + keyboard handler
- Set tabindex based on mode after setting aria-checked
- Attached handleSiteModeKeydown handler using captured hostname closure
- Proper roving tabindex: active gets tabindex=0, inactive gets tabindex=-1

### 7. crop-overlay.js: role=dialog, focus management, Korean aria-label
- Added `role="dialog" aria-label="화면 텍스트 영역 선택"` to overlay
- Capture `document.activeElement` before overlay start
- Set `tabindex="-1"` on overlay and call `.focus()` after append
- Restore focus to `previousActiveElement` on cancel/confirm (when still connected)

### 8. keyboard-radiogroup.test.js: test actual exported helper
- Created `keyboard-utils.js` exporting `getNextModeFromKeydown`
- Test imports and tests the actual exported function, not a local clone
- 9 test cases covering Arrow keys, Home/End, wrap-around, unrecognized keys

## New Files
- `keyboard-utils.js`: Pure keyboard navigation helper exported for both product code and tests

## Verification
- `node --check` on popup.js, options.js, crop-overlay.js, keyboard-utils.js: all pass
- `node --test tests/unit/*.test.js`: **56 tests pass** (47 original + 9 new)

## Notes
- No changes to background.js, content.js, shared.js, or manifest.json
- Korean UI preserved throughout
- LSP and Chrome DevTools unavailable for runtime verification per project constraints
- Focus restoration checks `document.contains(previousActiveElement)` before calling `.focus()`
