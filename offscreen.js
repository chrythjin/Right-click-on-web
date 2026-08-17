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
        typeof OCR_IMAGE_UTILS.normalizePreprocessing !== 'function') {
    throw new Error('OCR 이미지 유틸리티를 불러오지 못했습니다.');
  }
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
    const processedCanvas = document.createElement('canvas');
    processedCanvas.width = width;
    processedCanvas.height = height;
    const processedContext = processedCanvas.getContext('2d');
    const transformedPixels = OCR_IMAGE_UTILS.transformPixels(croppedImage.pixels, candidate);
    processedContext.putImageData(new ImageData(transformedPixels, width, height), 0, 0);

    if (candidate.upscale === 1) {
      return processedCanvas.toDataURL('image/png');
    }

    const scaledWidth = width * candidate.upscale;
    const scaledHeight = height * candidate.upscale;
    OCR_IMAGE_UTILS.assertSafePixelDimensions(scaledWidth, scaledHeight);
    const scaledCanvas = document.createElement('canvas');
    scaledCanvas.width = scaledWidth;
    scaledCanvas.height = scaledHeight;
    const scaledContext = scaledCanvas.getContext('2d');
    scaledContext.imageSmoothingEnabled = false;
    scaledContext.drawImage(processedCanvas, 0, 0, scaledWidth, scaledHeight);
    return scaledCanvas.toDataURL('image/png');
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== 'rcow:runOcr') {
      return;
    }

    (async () => {
      try {
        const { dataUrl, cropRect, devicePixelRatio, preprocessingProfile, useRequestedPreprocessing, requestId } = message;
        if (!dataUrl || !cropRect) {
          throw new Error('캡처 이미지 또는 크롭 영역이 누락되었습니다.');
        }

        // 1. Crop image via canvas
        const startedAt = performance.now();
        const croppedImage = await cropImage(dataUrl, cropRect, devicePixelRatio || 1);

        const worker = await getWorker();
        const plan = OCR_IMAGE_UTILS.createPreprocessingPlan(
          croppedImage.crop.width,
          croppedImage.crop.height,
          croppedImage.pixels
        );
        const recognize = (candidate) => worker.recognize(createCandidateDataUrl(croppedImage, candidate))
          .then(({ data }) => data);
        const recognition = useRequestedPreprocessing === true &&
          OCR_IMAGE_UTILS.PREPROCESSING_PROFILES.includes(preprocessingProfile)
          ? {
              data: await recognize(OCR_IMAGE_UTILS.normalizePreprocessing({ profile: preprocessingProfile })),
              preprocessing: OCR_IMAGE_UTILS.normalizePreprocessing({ profile: preprocessingProfile })
            }
          : await OCR_IMAGE_UTILS.recognizeWithCandidates(recognize, plan.initial, plan.alternate);

        sendResponse({ ...OCR_IMAGE_UTILS.createOcrSuccessResponse(
          recognition.data,
          croppedImage.crop,
          performance.now() - startedAt,
          recognition.preprocessing
        ), requestId });
      } catch (err) {
        console.error('Offscreen OCR error:', err);
        sendResponse({ ok: false, error: err.message || String(err), requestId: message.requestId });
      }
    })();

    return true; // Keep message channel open for async response
  });
})();
