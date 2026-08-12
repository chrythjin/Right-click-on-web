// Right-click on Web — offscreen.js
//
// Hosts Tesseract.js offline WASM OCR in an offscreen DOM environment.

(() => {
  'use strict';

  let workerPromise = null;

  async function initTesseractWorker() {
    const options = {
      workerPath: chrome.runtime.getURL('lib/worker.min.js'),
      corePath: chrome.runtime.getURL('lib/tesseract-core-simd-lstm.wasm.js'),
      langPath: chrome.runtime.getURL('langs/'),
      workerBlobURL: false
    };

    try {
      const worker = await Tesseract.createWorker(['kor', 'eng'], 1, options);
      return worker;
    } catch (simdErr) {
      console.warn('SIMD core init failed, falling back to standard LSTM core:', simdErr);
      const fallbackOptions = {
        ...options,
        corePath: chrome.runtime.getURL('lib/tesseract-core-lstm.wasm.js')
      };
      const worker = await Tesseract.createWorker(['kor', 'eng'], 1, fallbackOptions);
      return worker;
    }
  }

  function getWorker() {
    if (!workerPromise) {
      workerPromise = initTesseractWorker().catch((err) => {
        workerPromise = null;
        throw err;
      });
    }
    return workerPromise;
  }

  function cropImage(dataUrl, cropRect, dpr = 1) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.getElementById('cropCanvas');
        const sx = Math.max(0, Math.round(cropRect.x * dpr));
        const sy = Math.max(0, Math.round(cropRect.y * dpr));
        const sw = Math.round(cropRect.width * dpr);
        const sh = Math.round(cropRect.height * dpr);

        canvas.width = sw;
        canvas.height = sh;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = (e) => reject(new Error('이미지 캡처 데이터 로드 실패: ' + e));
      img.src = dataUrl;
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== 'rcow:runOcr') {
      return;
    }

    (async () => {
      try {
        const { dataUrl, cropRect, devicePixelRatio } = message;
        if (!dataUrl || !cropRect) {
          throw new Error('캡처 이미지 또는 크롭 영역이 누락되었습니다.');
        }

        // 1. Crop image via canvas
        const croppedDataUrl = await cropImage(dataUrl, cropRect, devicePixelRatio || 1);

        // 2. Run OCR via cached Tesseract worker
        const worker = await getWorker();
        const { data } = await worker.recognize(croppedDataUrl);
        const recognizedText = (data && data.text) ? data.text.trim() : '';

        sendResponse({ ok: true, text: recognizedText });
      } catch (err) {
        console.error('Offscreen OCR error:', err);
        sendResponse({ ok: false, error: err.message || String(err) });
      }
    })();

    return true; // Keep message channel open for async response
  });
})();
