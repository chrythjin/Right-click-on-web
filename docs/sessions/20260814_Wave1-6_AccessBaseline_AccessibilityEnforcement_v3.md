# 20260814_Wave1-6_AccessBaseline_AccessibilityEnforcement_v3

## Task
-wave-1-6-access-baseline v3: Fix keyboard-utils.js not used by product, crop keyboard issues.

## Rejection Findings Fixed

### 1. keyboard-utils.js UMD wrapper for browser+Node compatibility
- Rewrote as UMD (Universal Module Definition): works as CommonJS `require()` in Node and as `window.RIGHT_CLICK_ON_WEB_KEYBOARD_UTILS` in browser
- No `require()` in browser, no bundler needed
- popup.html and options.html now load keyboard-utils.js via `<script>` tags

### 2. popup.js uses keyboard-utils
- Added `<script src="keyboard-utils.js">` to popup.html
- popup.js now imports via `globalThis.RIGHT_CLICK_ON_WEB_KEYBOARD_UTILS`
- `handleModeKeydown` uses `KB.getNextModeFromKeydown()` instead of duplicated switch

### 3. options.js uses keyboard-utils
- Added `<script src="keyboard-utils.js">` to options.html
- options.js now uses `KB.getNextModeFromKeydown()` in `handleSiteModeKeydown`
- Uses captured `hostname` closure for domain update

### 4. crop-overlay.js keyboard crop: visible initial rect, proper edge resize, viewport clamp
- `startCrop()`: cropState=null initially, no visible rect until keyboard/mouse starts
- `handleKeydown`:
  - Enter/Arrow on hidden rect → `initCropKeyboard()` creates visible 200×150 centered rect
  - Plain Arrow → translate (move x/y by ±5px)
  - Shift+Arrow → resize (change width/height by ±20px for right/bottom edges)
  - All four edges clamped to viewport via `clampCropRect()`
  - Enter only submits if rect is valid (finite, ≥10px, within viewport)
  - Enter on invalid rect → announcement instead of submit
- `onMouseMove`/`onMouseUp`: clamp coordinates to viewport via `clamp(event.clientX, 0, vp.width)`
- `syncCropBoxToState()`: updates CSS left/top/width/height and sets display:block
- `updateSrInstruction()`: announces position/size on every keyboard action

### 5. crop geometry helpers added to keyboard-utils.js
- `clampCropRect(rect, vpW, vpH, min)` — matches crop-overlay.js exact logic
- `moveCropRect(rect, dx, dy, vpW, vpH, min)` — translate + clamp
- `resizeCropRect(rect, dw, dh, vpW, vpH, min)` — resize + clamp
- `isValidCropRect(rect, min)` — finite checks + min size check
- `initCropKeyboard(vpW, vpH, initW, initH)` — centered initial rect

### 6. New test file: tests/unit/crop-geometry.test.js
- 14 test cases covering clampCropRect, initCropKeyboard, isValidCropRect

## New Files
- `keyboard-utils.js` (updated UMD version)
- `tests/unit/crop-geometry.test.js`

## Modified Files
- `popup.html`: added keyboard-utils.js script
- `popup.js`: use KB.getNextModeFromKeydown, guard active before setAttribute
- `options.html`: added keyboard-utils.js script
- `options.js`: use KB.getNextModeFromKeydown in handleSiteModeKeydown
- `crop-overlay.js`: full keyboard crop system rewrite

## Verification
- `node --check` on popup.js, options.js, crop-overlay.js, keyboard-utils.js: all pass
- `node --test tests/unit/*.test.js`: **71 tests pass** (47 original + 9 keyboard-radiogroup + 15 crop-geometry)

## Notes
- LSP and Chrome DevTools unavailable for runtime verification per project constraints
- keyboard-utils.js UMD pattern: `(function(global,factory){...})(this, function(){...})`
- crop keyboard geometry: Arrow=translate, Shift+Arrow=resize right/bottom edges
- clampCropRect in keyboard-utils.js exactly mirrors crop-overlay.js clampCropRect
