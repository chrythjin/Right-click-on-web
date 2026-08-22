// Right-click on Web — crop-overlay.js
//
// Interactive screen area selection for offline WASM OCR.
// Injected into the top-level frame only (manifest all_frames: false).

(() => {
  'use strict';

  if (window.__rcowCropOverlayInitialized) {
    return;
  }
  window.__rcowCropOverlayInitialized = true;

  let overlayElement = null;
  let cropBoxElement = null;
  let tipElement = null;
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let toastContainer = null;
  let previousActiveElement = null;
  let cropState = null;

  const MIN_SIZE = 10;
  const STEP = 5;
  const LARGE_STEP = 20;

  const REQUIRED_KEYBOARD_UTIL_METHODS = Object.freeze([
    'clampCropRect',
    'initCropKeyboard',
    'isValidCropRect',
    'moveCropRect',
    'resizeCropRect'
  ]);

  const KEYBOARD_UTILS_ERROR = '영역 선택 기능을 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.';

  function getKU() {
    const keyboardUtils = globalThis.RIGHT_CLICK_ON_WEB_KEYBOARD_UTILS;
    if (!keyboardUtils || REQUIRED_KEYBOARD_UTIL_METHODS.some((name) => typeof keyboardUtils[name] !== 'function')) {
      return null;
    }
    return keyboardUtils;
  }

  function requireKU() {
    const keyboardUtils = getKU();
    if (keyboardUtils) {
      return keyboardUtils;
    }
    announceCropStatus(KEYBOARD_UTILS_ERROR);
    showToast(KEYBOARD_UTILS_ERROR, 'error', 4000);
    return null;
  }

  function getViewport() {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1
    };
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(val, max));
  }

  function syncCropBoxToState(rect) {
    if (!cropBoxElement) return;
    cropBoxElement.style.left = `${rect.x}px`;
    cropBoxElement.style.top = `${rect.y}px`;
    cropBoxElement.style.width = `${rect.width}px`;
    cropBoxElement.style.height = `${rect.height}px`;
    cropBoxElement.style.display = 'block';
    cropBoxElement.classList.add('is-capturing');
  }

  function updateSrInstruction(rect) {
    if (!tipElement) return;
    const srEl = tipElement.querySelector('.rcow-sr-instruction');
    if (srEl) {
      srEl.textContent = `선택: 좌 ${Math.round(rect.x)}, 상 ${Math.round(rect.y)}, 폭 ${Math.round(rect.width)}px, 높이 ${Math.round(rect.height)}px. 방향키 이동, Shift+방향키 크기 조정, Enter 확인, Esc 취소`;
    }
  }

  function announceCropStatus(message) {
    if (!tipElement) return;
    const srEl = tipElement.querySelector('.rcow-sr-instruction');
    if (srEl) {
      srEl.textContent = message;
    }
  }

  function ensureToastContainer() {
    if (!toastContainer || !document.contains(toastContainer)) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'rcow-toast-container';
      (document.body || document.documentElement).appendChild(toastContainer);
    }
    return toastContainer;
  }

  function showToast(message, type = 'info', duration = 3500) {
    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = `rcow-toast is-${type}`;

    if (type === 'loading') {
      const spinner = document.createElement('span');
      spinner.className = 'rcow-spinner';
      toast.appendChild(spinner);
    }

    const textSpan = document.createElement('span');
    textSpan.textContent = message;
    toast.appendChild(textSpan);

    container.appendChild(toast);

    if (duration > 0) {
      setTimeout(() => {
        toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px) scale(0.95)';
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }

    return {
      update(newMessage, newType = 'info') {
        textSpan.textContent = newMessage;
        toast.className = `rcow-toast is-${newType}`;
        const existingSpinner = toast.querySelector('.rcow-spinner');
        if (newType === 'loading' && !existingSpinner) {
          const spinner = document.createElement('span');
          spinner.className = 'rcow-spinner';
          toast.insertBefore(spinner, textSpan);
        } else if (newType !== 'loading' && existingSpinner) {
          existingSpinner.remove();
        }
      },
      remove() {
        toast.remove();
      }
    };
  }

  function isMeaningfullyFocusable(element) {
    if (!element || !element.isConnected || typeof element.focus !== 'function') {
      return false;
    }
    const tagName = element.tagName?.toLowerCase();
    if (!tagName || tagName === 'body' || tagName === 'html' || element.disabled) {
      return false;
    }
    if (['input', 'textarea', 'select', 'button'].includes(tagName)) {
      return true;
    }
    if (tagName === 'a' && element.hasAttribute('href')) {
      return true;
    }
    return element.hasAttribute('tabindex') || element.isContentEditable;
  }

  function removeOverlay() {
    if (overlayElement) {
      overlayElement.remove();
      overlayElement = null;
    }
    if (cropBoxElement) {
      cropBoxElement.remove();
      cropBoxElement = null;
    }
    if (tipElement) {
      tipElement.remove();
      tipElement = null;
    }
    isDragging = false;
    document.removeEventListener('keydown', handleKeydown, true);
    if (isMeaningfullyFocusable(previousActiveElement)) {
      previousActiveElement.focus({ preventScroll: true });
    }
    previousActiveElement = null;
  }

  function resetOverlayState() {
    try {
      overlayElement?.remove();
      cropBoxElement?.remove();
      tipElement?.remove();
    } catch (_) {}
    overlayElement = null;
    cropBoxElement = null;
    tipElement = null;
    isDragging = false;
    cropState = null;
  }

  function handleKeydown(event) {
    const key = event.key;
    const isEscape = key === 'Escape';
    const isEnter = key === 'Enter';
    const isArrow = key.startsWith('Arrow');

    if (isEscape) {
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        removeOverlay();
      } catch (_) {
        resetOverlayState();
      }
      return;
    }

    if (!cropState) {
      return;
    }

    if (isEnter) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const keyboardUtils = requireKU();
      if (!keyboardUtils) {
        return;
      }
      const vp = getViewport();
      const clamped = keyboardUtils.clampCropRect(cropState, vp.width, vp.height, MIN_SIZE);
      if (!clamped || !keyboardUtils.isValidCropRect(clamped, vp.width, vp.height, MIN_SIZE)) {
        announceCropStatus('영역이 너무 작거나 뷰포트 밖입니다. 방향키로 조정 후 Enter를 누르세요.');
        return;
      }
      const cropRect = { x: clamped.x, y: clamped.y, width: clamped.width, height: clamped.height };
      removeOverlay();
      const dpr = window.devicePixelRatio || 1;
      const toast = showToast('화면 텍스트를 인식하고 있습니다 (로컬 OCR)...', 'loading', 0);
      (async () => {
        try {
          const response = await chrome.runtime.sendMessage({
            type: 'rcow:captureAndOcr',
            cropRect,
            devicePixelRatio: dpr,
            viewport: vp,
            source: 'region'
          });
          if (!response || !response.ok) {
            toast.update(`OCR 인식 실패: ${response?.error || '알 수 없는 오류'}`, 'error');
            setTimeout(() => toast.remove(), 4000);
            return;
          }
          const extractedText = (response.text || '').trim();
          if (!extractedText) {
            toast.update('인식된 텍스트가 없습니다. 영역을 다시 선택해 보세요.', 'error');
            setTimeout(() => toast.remove(), 3500);
            return;
          }
          await copyToClipboard(extractedText);
          const preview = extractedText.length > 30 ? `${extractedText.slice(0, 30)}...` : extractedText;
          toast.update(`복사 완료 (${extractedText.length}자): "${preview}"`, 'success');
          setTimeout(() => toast.remove(), 4000);
        } catch (err) {
          toast.update(`오류 발생: ${err.message || String(err)}`, 'error');
          setTimeout(() => toast.remove(), 4000);
        }
      })();
      return;
    }

    if (!isArrow) return;
    event.preventDefault();

    const keyboardUtils = requireKU();
    if (!keyboardUtils) {
      return;
    }

    const vp = getViewport();
    const step = event.shiftKey ? LARGE_STEP : STEP;
    let newRect;

    switch (key) {
      case 'ArrowLeft':
        if (event.shiftKey) {
          newRect = keyboardUtils.resizeCropRect(cropState, -step, 0, vp.width, vp.height, MIN_SIZE);
        } else {
          newRect = keyboardUtils.moveCropRect(cropState, -step, 0, vp.width, vp.height, MIN_SIZE);
        }
        break;
      case 'ArrowRight':
        if (event.shiftKey) {
          newRect = keyboardUtils.resizeCropRect(cropState, step, 0, vp.width, vp.height, MIN_SIZE);
        } else {
          newRect = keyboardUtils.moveCropRect(cropState, step, 0, vp.width, vp.height, MIN_SIZE);
        }
        break;
      case 'ArrowUp':
        if (event.shiftKey) {
          newRect = keyboardUtils.resizeCropRect(cropState, 0, -step, vp.width, vp.height, MIN_SIZE);
        } else {
          newRect = keyboardUtils.moveCropRect(cropState, 0, -step, vp.width, vp.height, MIN_SIZE);
        }
        break;
      case 'ArrowDown':
        if (event.shiftKey) {
          newRect = keyboardUtils.resizeCropRect(cropState, 0, step, vp.width, vp.height, MIN_SIZE);
        } else {
          newRect = keyboardUtils.moveCropRect(cropState, 0, step, vp.width, vp.height, MIN_SIZE);
        }
        break;
      default:
        return;
    }

    if (!newRect) {
      announceCropStatus('이 방향으로는 더 이상 이동할 수 없습니다.');
      return;
    }

    cropState = newRect;
    syncCropBoxToState(cropState);
    updateSrInstruction(cropState);
  }

  function startCrop() {
    if (overlayElement) {
      return { ok: true };
    }

    const keyboardUtils = requireKU();
    if (!keyboardUtils) {
      return { ok: false, error: KEYBOARD_UTILS_ERROR };
    }

    previousActiveElement = document.activeElement;

    const vp = getViewport();
    cropState = keyboardUtils.initCropKeyboard(vp.width, vp.height, Math.min(200, vp.width * 0.3), Math.min(150, vp.height * 0.3));

    if (!cropState) {
      const error = '화면이 너무 작아 영역을 선택할 수 없습니다.';
      showToast(error, 'error', 4000);
      return { ok: false, error };
    }

    overlayElement = document.createElement('div');
    overlayElement.className = 'rcow-crop-overlay';
    overlayElement.setAttribute('role', 'dialog');
    overlayElement.setAttribute('aria-label', '화면 텍스트 영역 선택');

    cropBoxElement = document.createElement('div');
    cropBoxElement.className = 'rcow-crop-box';

    tipElement = document.createElement('div');
    tipElement.className = 'rcow-crop-tip';
    tipElement.innerHTML = `
      <span class="rcow-badge">OCR</span>
      <span>방향키 이동, Shift+방향키 크기 조정, Enter 확인, Esc 취소, 드래그로 영역 재선택</span>
      <span class="rcow-sr-instruction" aria-live="polite" aria-atomic="true"></span>
    `;

    overlayElement.addEventListener('mousedown', onMouseDown, true);
    overlayElement.addEventListener('mousemove', onMouseMove, true);
    overlayElement.addEventListener('mouseup', onMouseUp, true);
    document.addEventListener('keydown', handleKeydown, true);

    const root = document.body || document.documentElement;
    root.appendChild(overlayElement);
    root.appendChild(cropBoxElement);
    root.appendChild(tipElement);

    syncCropBoxToState(cropState);
    updateSrInstruction(cropState);
    overlayElement.setAttribute('tabindex', '-1');
    overlayElement.focus();
    return { ok: true };
  }

  function onMouseDown(event) {
    if (event.button !== 0) {
      removeOverlay();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();

    isDragging = true;
    cropState = null;

    const vp = getViewport();
    startX = clamp(event.clientX, 0, vp.width);
    startY = clamp(event.clientY, 0, vp.height);

    cropBoxElement.style.left = `${startX}px`;
    cropBoxElement.style.top = `${startY}px`;
    cropBoxElement.style.width = '0px';
    cropBoxElement.style.height = '0px';
    cropBoxElement.style.display = 'block';
    cropBoxElement.classList.add('is-capturing');
  }

  function onMouseMove(event) {
    if (!isDragging) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const vp = getViewport();
    const currentX = clamp(event.clientX, 0, vp.width);
    const currentY = clamp(event.clientY, 0, vp.height);

    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    cropBoxElement.style.left = `${left}px`;
    cropBoxElement.style.top = `${top}px`;
    cropBoxElement.style.width = `${width}px`;
    cropBoxElement.style.height = `${height}px`;
  }

  async function onMouseUp(event) {
    if (!isDragging) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const keyboardUtils = requireKU();
    if (!keyboardUtils) {
      removeOverlay();
      return;
    }

    const vp = getViewport();
    const endX = clamp(event.clientX, 0, vp.width);
    const endY = clamp(event.clientY, 0, vp.height);

    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);

    removeOverlay();

    const cropRect = {
      x: left,
      y: top,
      width: width,
      height: height
    };
    if (!keyboardUtils.isValidCropRect(cropRect, vp.width, vp.height, MIN_SIZE)) {
      return;
    }
    const dpr = window.devicePixelRatio || 1;

    const toast = showToast('화면 텍스트를 인식하고 있습니다 (로컬 OCR)...', 'loading', 0);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'rcow:captureAndOcr',
        cropRect,
        devicePixelRatio: dpr,
        viewport: vp,
        source: 'region'
      });

      if (!response || !response.ok) {
        toast.update(`OCR 인식 실패: ${response?.error || '알 수 없는 오류'}`, 'error');
        setTimeout(() => toast.remove(), 4000);
        return;
      }

      const extractedText = (response.text || '').trim();
      if (!extractedText) {
        toast.update('인식된 텍스트가 없습니다. 영역을 다시 선택해 보세요.', 'error');
        setTimeout(() => toast.remove(), 3500);
        return;
      }

      await copyToClipboard(extractedText);
      const preview = extractedText.length > 30 ? `${extractedText.slice(0, 30)}...` : extractedText;
      toast.update(`복사 완료 (${extractedText.length}자): "${preview}"`, 'success');
      setTimeout(() => toast.remove(), 4000);
    } catch (err) {
      toast.update(`오류 발생: ${err.message || String(err)}`, 'error');
      setTimeout(() => toast.remove(), 4000);
    }
  }

  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch (_) {}

    // Fallback using textarea execCommand
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    (document.body || document.documentElement).appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
    } finally {
      ta.remove();
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === 'rcow:startCrop') {
      if (typeof message.notice === 'string' && message.notice) {
        showToast(message.notice, 'info', 4500);
      }
      sendResponse(startCrop());
    }
    if (message && message.type === 'rcow:getViewport') {
      const devicePixelRatio = window.devicePixelRatio || 1;
      sendResponse({
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio
      });
    }
  });
})();
