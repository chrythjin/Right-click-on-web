// Right-click on Web — offscreen.js
//
// Hosts Tesseract.js offline WASM OCR in an offscreen DOM environment.

(() => {
  'use strict';

  const OCR_IMAGE_UTILS = globalThis.RIGHT_CLICK_ON_WEB_OCR_IMAGE_UTILS;
  if (!OCR_IMAGE_UTILS ||
       typeof OCR_IMAGE_UTILS.calculateCropBounds !== 'function' ||
         typeof OCR_IMAGE_UTILS.createOcrSuccessResponse !== 'function' ||
          typeof OCR_IMAGE_UTILS.createPreprocessingPlan !== 'function' ||
          typeof OCR_IMAGE_UTILS.recognizeWithCandidates !== 'function' ||
          typeof OCR_IMAGE_UTILS.normalizePreprocessing !== 'function' ||
          typeof OCR_IMAGE_UTILS.transformImageData !== 'function' ||
          typeof OCR_IMAGE_UTILS.summarizeOcrDetail !== 'function') {
    throw new Error('OCR 이미지 유틸리티를 불러오지 못했습니다.');
  }
  const OCR_PROGRESS_MIN_INTERVAL_MS = 250;
  const WORKER_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
  let workerPromise = null;
  let activeRequestId = 0;
  const pendingRequests = new Map();
  const lastProgressAt = new Map();
  let lifecycleTail = Promise.resolve();
  let idleTimer = null;

  function enqueueLifecycle(operation) {
    const next = lifecycleTail.then(operation, operation);
    lifecycleTail = next.catch(() => {});
    return next;
  }

  function clearIdleTimer() {
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = null;
  }

  function scheduleIdleTermination() {
    clearIdleTimer();
    if (pendingRequests.size !== 0 || !workerPromise) return;
    idleTimer = setTimeout(() => {
      idleTimer = null;
      void enqueueLifecycle(async () => {
        if (pendingRequests.size !== 0 || !workerPromise) return;
        const worker = await workerPromise;
        workerPromise = null;
        await worker.terminate();
      });
    }, WORKER_IDLE_TIMEOUT_MS);
  }

  function normalizeRequestId(value) {
    return Number.isInteger(value) && value > 0 ? value : 0;
  }

  function normalizeProgress(value) {
    return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  }

  function normalizePhase(value) {
    return typeof value === 'string'
      ? value.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim().slice(0, 80)
      : '';
  }

  function sendProgress(requestId, progress, phase, force = false) {
    if (!pendingRequests.has(requestId)) return;
    const now = Date.now();
    const previous = lastProgressAt.get(requestId) || 0;
    if (!force && now - previous < OCR_PROGRESS_MIN_INTERVAL_MS) return;
    lastProgressAt.set(requestId, now);
    void chrome.runtime.sendMessage({
      type: 'rcow:ocrProgress',
      requestId,
      progress: normalizeProgress(progress),
      phase: normalizePhase(phase)
    });
  }

  function respondOnce(requestId, response) {
    const pending = pendingRequests.get(requestId);
    if (!pending || pending.responded) return false;
    pending.responded = true;
    pendingRequests.delete(requestId);
    lastProgressAt.delete(requestId);
    pending.sendResponse({ ...response, requestId });
    return true;
  }

  function cancelRequest(requestId) {
    const pending = pendingRequests.get(requestId);
    if (!pending) return false;
    pending.cancelled = true;
    return respondOnce(requestId, { ok: false, cancelled: true, error: 'OCR 요청이 취소되었습니다.' });
  }

  async function initTesseractWorker() {
    const options = {
      workerPath: chrome.runtime.getURL('lib/worker.min.js'),
      corePath: chrome.runtime.getURL('lib/tesseract-core-simd-lstm.wasm.js'),
      langPath: chrome.runtime.getURL('langs/'),
      workerBlobURL: false,
      logger: (message) => {
        const requestId = activeRequestId;
        if (!requestId || !pendingRequests.has(requestId)) return;
        sendProgress(requestId, message?.progress, message?.status);
      }
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
    clearIdleTimer();
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
        const { sx, sy, sw, sh } = OCR_IMAGE_UTILS.calculateCropBounds(
          cropRect,
          dpr,
          img.naturalWidth,
          img.naturalHeight
        );

        if (sw <= 0 || sh <= 0) {
          reject(new Error('선택한 영역이 화면 캡처 범위를 벗어났습니다.'));
          return;
        }
        OCR_IMAGE_UTILS.assertSafePixelDimensions(sw, sh);

        canvas.width = sw;
        canvas.height = sh;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        const pixels = sw * sh <= 4000000 ? ctx.getImageData(0, 0, sw, sh).data : null;
        if (pixels && !OCR_IMAGE_UTILS.hasVisiblePixels(pixels)) {
          reject(new Error('선택한 OCR 영역에 인식할 이미지가 없습니다.'));
          return;
        }
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          crop: { width: sw, height: sh },
          pixels
        });
      };
      img.onerror = (e) => reject(new Error('이미지 캡처 데이터 로드 실패: ' + e));
      img.src = dataUrl;
    });
  }

  function createCandidateDataUrl(croppedImage, candidate) {
    if (candidate.profile === 'off') {
      return croppedImage.dataUrl;
    }
    if (!croppedImage.pixels) {
      throw new Error('선택한 OCR 영역이 전처리 안전 한도를 벗어났습니다.');
    }

    const { width, height } = croppedImage.crop;
    const transformedImage = OCR_IMAGE_UTILS.transformImageData(croppedImage.pixels, width, height, candidate);
    const processedCanvas = document.createElement('canvas');
    processedCanvas.width = transformedImage.width;
    processedCanvas.height = transformedImage.height;
    const processedContext = processedCanvas.getContext('2d');
    processedContext.putImageData(
      new ImageData(transformedImage.pixels, transformedImage.width, transformedImage.height),
      0,
      0
    );
    return processedCanvas.toDataURL('image/png');
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== 'object') {
      return;
    }
    if (message.type === 'rcow:cancelOcr' && message.target === 'offscreen') {
      const requestId = normalizeRequestId(message.requestId);
      sendResponse({ ok: cancelRequest(requestId), requestId });
      return;
    }
    if (message.type !== 'rcow:runOcr') return;

    const requestId = normalizeRequestId(message.requestId);
    if (!requestId) {
      sendResponse({ ok: false, error: 'OCR 요청 ID가 올바르지 않습니다.', requestId: message.requestId });
      return;
    }
    clearIdleTimer();
    pendingRequests.set(requestId, { cancelled: false, responded: false, sendResponse });
    void enqueueLifecycle(async () => {
      const requestId = normalizeRequestId(message.requestId);
      try {
        if (!pendingRequests.has(requestId)) return;
        const { dataUrl, cropRect, devicePixelRatio, preprocessingProfile, useRequestedPreprocessing } = message;
        if (!dataUrl || !cropRect) {
          throw new Error('캡처 이미지 또는 크롭 영역이 누락되었습니다.');
        }

        // 1. Crop image via canvas
        const startedAt = performance.now();
        const croppedImage = await cropImage(dataUrl, cropRect, devicePixelRatio || 1);

        if (!pendingRequests.has(requestId)) return;
        activeRequestId = requestId;
        sendProgress(requestId, 0, 'preprocessing', true);
        const worker = await getWorker();
        if (!pendingRequests.has(requestId)) return;
        const plan = OCR_IMAGE_UTILS.createPreprocessingPlan(
          croppedImage.crop.width,
          croppedImage.crop.height,
          croppedImage.pixels
        );
        const attempts = [];
        const recognize = async (candidate) => {
          const attemptStartedAt = performance.now();
          const { data } = await worker.recognize(createCandidateDataUrl(croppedImage, candidate));
          attempts.push({
            profile: candidate.profile,
            confidence: OCR_IMAGE_UTILS.summarizeOcrConfidence(data?.words).average,
            timingMs: performance.now() - attemptStartedAt
          });
          return data;
        };
        const recognition = useRequestedPreprocessing === true &&
          OCR_IMAGE_UTILS.PREPROCESSING_PROFILES.includes(preprocessingProfile)
          ? {
              data: await recognize(OCR_IMAGE_UTILS.normalizePreprocessing({ profile: preprocessingProfile })),
              preprocessing: OCR_IMAGE_UTILS.normalizePreprocessing({ profile: preprocessingProfile })
            }
          : await OCR_IMAGE_UTILS.recognizeWithCandidates(recognize, plan.initial, plan.alternate);

        if (!pendingRequests.has(requestId)) return;
        respondOnce(requestId, { ...OCR_IMAGE_UTILS.createOcrSuccessResponse(
          recognition.data,
          croppedImage.crop,
          performance.now() - startedAt,
          recognition.preprocessing
        ), attempts, detail: OCR_IMAGE_UTILS.summarizeOcrDetail(recognition.data, croppedImage.crop) });
      } catch (err) {
        console.error('Offscreen OCR error:', err);
        respondOnce(requestId, { ok: false, error: err.message || String(err) });
      } finally {
        if (activeRequestId === requestId) activeRequestId = 0;
        scheduleIdleTermination();
      }
    });

    return true; // Keep message channel open for async response
  });
})();
