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
  }

  function resetOverlayState() {
    overlayElement = null;
    cropBoxElement = null;
    tipElement = null;
    isDragging = false;
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      document.removeEventListener('keydown', handleKeydown, true);
      try {
        removeOverlay();
      } catch (_) {
        resetOverlayState();
      }
    }
  }

  function startCrop() {
    if (overlayElement) {
      return;
    }

    overlayElement = document.createElement('div');
    overlayElement.className = 'rcow-crop-overlay';

    cropBoxElement = document.createElement('div');
    cropBoxElement.className = 'rcow-crop-box';
    cropBoxElement.style.display = 'none';

    tipElement = document.createElement('div');
    tipElement.className = 'rcow-crop-tip';
    tipElement.innerHTML = `
      <span class="rcow-badge">OCR</span>
      <span>추출할 텍스트 영역을 마우스로 드래그하세요 (취소: Esc)</span>
    `;

    overlayElement.addEventListener('mousedown', onMouseDown, true);
    overlayElement.addEventListener('mousemove', onMouseMove, true);
    overlayElement.addEventListener('mouseup', onMouseUp, true);
    document.addEventListener('keydown', handleKeydown, true);

    const root = document.body || document.documentElement;
    root.appendChild(overlayElement);
    root.appendChild(cropBoxElement);
    root.appendChild(tipElement);
  }

  function onMouseDown(event) {
    if (event.button !== 0) {
      removeOverlay();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();

    isDragging = true;
    startX = event.clientX;
    startY = event.clientY;

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

    const currentX = event.clientX;
    const currentY = event.clientY;

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

    const endX = event.clientX;
    const endY = event.clientY;

    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);

    removeOverlay();

    if (width < 10 || height < 10) {
      return;
    }

    const cropRect = {
      x: left,
      y: top,
      width: width,
      height: height
    };
    const dpr = window.devicePixelRatio || 1;

    const toast = showToast('화면 텍스트를 인식하고 있습니다 (로컬 OCR)...', 'loading', 0);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'rcow:captureAndOcr',
        cropRect,
        devicePixelRatio: dpr
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

      // Copy text to clipboard
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
    document.body.appendChild(ta);
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
      startCrop();
      sendResponse({ ok: true });
    }
  });
})();
