# 20260814_Wave1-6_AccessBaseline_AccessibilityEnforcement_v7

## Task
Wave 1.6 access-baseline v7 FINAL: verified keyboard-utils.js/crop-overlay.js correct on disk.

## Final Verification (v7)

### keyboard-utils.js correctness
- `moveCropRect` preserves width/height exactly via direct x/y clamping only
- `isValidCropRect`: explicit `Infinity` rejected via `viewport !== undefined && !Number.isFinite(viewport)` BEFORE default
- `undefined` → `Infinity` default allows "no bounds" sentinel; explicit `Infinity` → rejected
- All defaults set before guards: `clampCropRect`, `moveCropRect`, `isValidCropRect`, `initCropKeyboard`

### crop-overlay.js uses shared helpers
- `KU.moveCropRect` for plain Arrow keys (translation only)
- `KU.resizeCropRect` for Shift+Arrow keys (edge resize)
- `KU.initCropKeyboard` for initial rect
- `KU.isValidCropRect` for Enter validation
- Korean tip: "방향키 이동, Shift+방향키 크기 조정, Enter 확인, Esc 취소, 드래그로 영역 재선택"

## Modified Files
- `keyboard-utils.js` (NEW untracked): UMD browser+Node helper
- `crop-overlay.js` (modified): uses keyboard-utils.js helpers
- `tests/unit/crop-geometry.test.js` (NEW): 45 test cases
- `tests/unit/keyboard-radiogroup.test.js` (NEW): 9 test cases
- `popup/options CSS/HTML/JS`: ARIA and keyboard accessibility
- `crop-overlay.css`: reduced motion, sr-only, viewport support

## Verification
- `node --check` on all JS: pass
- `node --test tests/unit/*.test.js`: **101 tests pass**
- `pwsh -NoProfile -File scripts/verify.ps1`: all checks pass

## Korean Finding (learnings.md appended)
- keyboard-utils.js UMD form, moveCropRect translation-only, Infinity default/reject semantics, Korean tip text

## Task
Wave 1.6 access-baseline v5: Fix startCrop() not showing visible rect, isValidCropRect accepting Infinity, clampCropRect producing NaN.

## Rejection Findings Fixed

### 1. startCrop() now shows visible rect immediately
- Removed `cropBoxElement.style.display = 'none'` from startCrop()
- Removed the `showAsCapturing` guard in handleKeydown (crop always visible after startCrop())
- startCrop() now calls `KU.initCropKeyboard()`, `syncCropBoxToState()`, and `updateSrInstruction()` immediately
- Small viewport (< MIN_SIZE): shows error toast "화면이 너무 작아 영역을 선택할 수 없습니다." and returns without opening overlay

### 2. isValidCropRect rejects Infinity/NaN/zero/negative viewport dimensions
- Added checks: `!Number.isFinite(viewportWidth/Height)`, `viewportWidth/Height <= 0`, `minSize <= 0`
- Added check: `viewportWidth < minSize || viewportHeight < minSize`
- Removed Infinity defaults - viewport dimensions must be explicitly valid
- Test "Infinity viewport defaults to minSize check only" removed and replaced with strict rejection tests

### 3. clampCropRect hardens against NaN/Infinity inputs
- Added guards: `!Number.isFinite(viewportWidth/Height/minSize)`, `viewportWidth/Height <= 0`, `minSize <= 0`
- Added guard: `viewportWidth < minSize || viewportHeight < minSize`
- Added guard: `!rect` and `!Number.isFinite(rect fields)`
- Returns `null` for all invalid inputs instead of producing NaN

### 4. crop-overlay.js uses KU.moveCropRect and KU.resizeCropRect
- handleKeydown now calls `KU.moveCropRect` for plain arrows and `KU.resizeCropRect` for Shift+arrows
- moveCropRect/resizeCropRect added input validation and pass through to clampCropRect
- null from moveCropRect/resizeCropRect triggers Korean announcement "이 방향으로는 더 이상 이동할 수 없습니다."

### 5. initCropKeyboard returns null for sub-minimum viewports
- Added guards for Infinity/NaN/zero/negative viewport dimensions
- Returns null if `viewportWidth < MIN_SIZE || viewportHeight < MIN_SIZE`
- Clamps initWidth/initHeight to [MIN_SIZE, viewportWidth/Height] range

## Modified Files
- `keyboard-utils.js`: hardened clampCropRect, isValidCropRect, initCropKeyboard; added guards to moveCropRect, resizeCropRect
- `crop-overlay.js`: startCrop() shows visible rect immediately; handleKeydown uses KU.move/resizeCropRect; small viewport error handling
- `tests/unit/crop-geometry.test.js`: 45 test cases covering all new boundary conditions and null contracts

## Verification
- `node --check` on all JS files: pass
- `node --test tests/unit/*.test.js`: **97 tests pass** (47 original + 9 keyboard-radiogroup + 41 crop-geometry)
- `pwsh -NoProfile -File scripts/verify.ps1`: all checks pass

## Architecture Notes
- keyboard-utils.js UMD: works as `require()` in Node and `globalThis.RIGHT_CLICK_ON_WEB_KEYBOARD_UTILS` in browser
- Single geometry source of truth: keyboard-utils.js exports all crop math
- crop-overlay.js is a pure consumer of keyboard-utils.js helpers
- LSP and Chrome DevTools unavailable for runtime verification; deployment gate remains outstanding
- No Infinity/NaN geometry can reach CSS from any code path
