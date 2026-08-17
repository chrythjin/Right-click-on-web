'use strict';

(function (global, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    global.RIGHT_CLICK_ON_WEB_KEYBOARD_UTILS = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  const MODE_LITE = 'lite';
  const MODE_ULTIMATE = 'ultimate';

  // Popup preset radiogroup order (task 2.4). Only the three primary
  // compatibility presets are exposed in the popup; advanced/custom
  // presets remain for the options dashboard (task 2.5). The order
  // matches the visual left-to-right layout so ArrowRight/Down moves
  // forward and ArrowLeft/Up moves backward, wrapping at the ends.
  const PRESET_SAFE = 'safe';
  const PRESET_COMPLETE = 'complete';
  const PRESET_UPLOAD_SAFE = 'upload-safe';
  const POPUP_PRESET_ORDER = Object.freeze([PRESET_SAFE, PRESET_COMPLETE, PRESET_UPLOAD_SAFE]);

  function getNextModeFromKeydown(currentMode, eventKey) {
    const isLiteActive = currentMode === MODE_LITE;
    const isUltimateActive = currentMode === MODE_ULTIMATE;

    let next;
    switch (eventKey) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = isLiteActive ? MODE_ULTIMATE : MODE_LITE;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = isUltimateActive ? MODE_LITE : MODE_ULTIMATE;
        break;
      case 'Home':
        next = MODE_LITE;
        break;
      case 'End':
        next = MODE_ULTIMATE;
        break;
      default:
        return null;
    }
    return next;
  }

  // Roving-tabindex navigation for the 3-preset radiogroup. Returns the
  // next preset id in POPUP_PRESET_ORDER, or null when the key is not a
  // navigation key or currentPreset is outside the popup set (e.g.
  // 'selection', 'media-safe', 'custom' — those live in options only).
  function getNextPresetFromKeydown(currentPreset, eventKey) {
    const index = POPUP_PRESET_ORDER.indexOf(currentPreset);
    if (index === -1) {
      return null;
    }
    let nextIndex;
    switch (eventKey) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (index + 1) % POPUP_PRESET_ORDER.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = (index - 1 + POPUP_PRESET_ORDER.length) % POPUP_PRESET_ORDER.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = POPUP_PRESET_ORDER.length - 1;
        break;
      default:
        return null;
    }
    return POPUP_PRESET_ORDER[nextIndex];
  }

  function clampCropRect(rect, viewportWidth, viewportHeight, minSize) {
    if (minSize === undefined) minSize = 10;
    if (viewportWidth === undefined) viewportWidth = 1920;
    if (viewportHeight === undefined) viewportHeight = 1080;
    if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight) || !Number.isFinite(minSize)) return null;
    if (viewportWidth <= 0 || viewportHeight <= 0 || minSize <= 0) return null;
    if (viewportWidth < minSize || viewportHeight < minSize) return null;

    if (!rect) return null;
    if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y) || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return null;

    const maxX = viewportWidth - minSize;
    const maxY = viewportHeight - minSize;
    const rawRight = rect.x + rect.width;
    const rawBottom = rect.y + rect.height;
    const clampedRight = Math.min(Math.max(minSize, rawRight), viewportWidth);
    const clampedBottom = Math.min(Math.max(minSize, rawBottom), viewportHeight);
    const clampedX = Math.max(0, Math.min(rect.x, maxX));
    const clampedY = Math.max(0, Math.min(rect.y, maxY));
    const clampedW = Math.max(minSize, clampedRight - clampedX);
    const clampedH = Math.max(minSize, clampedBottom - clampedY);

    return {
      x: clampedX,
      y: clampedY,
      width: clampedW,
      height: clampedH
    };
  }

  function moveCropRect(rect, dx, dy, viewportWidth, viewportHeight, minSize) {
    if (!rect) return null;
    if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y) || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return null;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
    if (minSize === undefined) minSize = 10;
    if (viewportWidth === undefined) viewportWidth = 1920;
    if (viewportHeight === undefined) viewportHeight = 1080;
    if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight) || !Number.isFinite(minSize)) return null;
    if (viewportWidth <= 0 || viewportHeight <= 0 || minSize <= 0) return null;
    if (viewportWidth < minSize || viewportHeight < minSize) return null;
    const maxX = Math.max(0, viewportWidth - rect.width);
    const maxY = Math.max(0, viewportHeight - rect.height);
    const newX = Math.max(0, Math.min(rect.x + dx, maxX));
    const newY = Math.max(0, Math.min(rect.y + dy, maxY));
    return { x: newX, y: newY, width: rect.width, height: rect.height };
  }

  function resizeCropRect(rect, dw, dh, viewportWidth, viewportHeight, minSize) {
    if (!rect) return null;
    if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y) || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return null;
    if (!Number.isFinite(dw) || !Number.isFinite(dh)) return null;
    if (minSize === undefined) minSize = 10;
    const rawW = Math.max(minSize, rect.width + dw);
    const rawH = Math.max(minSize, rect.height + dh);
    return clampCropRect({ x: rect.x, y: rect.y, width: rawW, height: rawH }, viewportWidth, viewportHeight, minSize);
  }

  function isValidCropRect(rect, viewportWidth, viewportHeight, minSize) {
    if (!rect) return false;
    if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y) || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return false;
    if (minSize === undefined) minSize = 10;
    if (!Number.isFinite(minSize) || minSize <= 0) return false;
    if (viewportWidth !== undefined && !Number.isFinite(viewportWidth)) return false;
    if (viewportHeight !== undefined && !Number.isFinite(viewportHeight)) return false;
    if (viewportWidth === undefined) viewportWidth = 1920;
    if (viewportHeight === undefined) viewportHeight = 1080;
    if (viewportWidth <= 0 || viewportHeight <= 0) return false;
    if (viewportWidth < minSize || viewportHeight < minSize) return false;
    if (rect.x < 0 || rect.y < 0) return false;
    if (rect.x + rect.width > viewportWidth) return false;
    if (rect.y + rect.height > viewportHeight) return false;
    if (rect.width < minSize || rect.height < minSize) return false;
    return true;
  }

  function initCropKeyboard(viewportWidth, viewportHeight, initWidth, initHeight) {
    if (viewportWidth === undefined) viewportWidth = 1920;
    if (viewportHeight === undefined) viewportHeight = 1080;
    if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight)) return null;
    if (viewportWidth <= 0 || viewportHeight <= 0) return null;
    const MIN_SIZE = 10;
    if (viewportWidth < MIN_SIZE || viewportHeight < MIN_SIZE) return null;
    if (initWidth === undefined || !Number.isFinite(initWidth)) initWidth = Math.min(200, viewportWidth * 0.3);
    if (initHeight === undefined || !Number.isFinite(initHeight)) initHeight = Math.min(150, viewportHeight * 0.3);
    initWidth = Math.max(MIN_SIZE, Math.min(initWidth, viewportWidth));
    initHeight = Math.max(MIN_SIZE, Math.min(initHeight, viewportHeight));
    const initX = Math.max(0, (viewportWidth - initWidth) / 2);
    const initY = Math.max(0, (viewportHeight - initHeight) / 2);
    return { x: initX, y: initY, width: initWidth, height: initHeight };
  }

  return {
    MODE_LITE: MODE_LITE,
    MODE_ULTIMATE: MODE_ULTIMATE,
    PRESET_SAFE: PRESET_SAFE,
    PRESET_COMPLETE: PRESET_COMPLETE,
    PRESET_UPLOAD_SAFE: PRESET_UPLOAD_SAFE,
    POPUP_PRESET_ORDER: POPUP_PRESET_ORDER,
    getNextModeFromKeydown: getNextModeFromKeydown,
    getNextPresetFromKeydown: getNextPresetFromKeydown,
    clampCropRect: clampCropRect,
    moveCropRect: moveCropRect,
    resizeCropRect: resizeCropRect,
    isValidCropRect: isValidCropRect,
    initCropKeyboard: initCropKeyboard
  };
}));
