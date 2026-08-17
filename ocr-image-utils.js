(function ocrImageUtilsInit(root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else if (root) {
    root.RIGHT_CLICK_ON_WEB_OCR_IMAGE_UTILS = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createOcrImageUtils() {
  'use strict';

  function scalePixelLength(cssPixels, devicePixelRatio = 1) {
    return Math.round(cssPixels * devicePixelRatio);
  }

  function calculateCropBounds(cropRect, devicePixelRatio, imageWidth, imageHeight) {
    const sx = Math.min(imageWidth, Math.max(0, scalePixelLength(cropRect.x, devicePixelRatio)));
    const sy = Math.min(imageHeight, Math.max(0, scalePixelLength(cropRect.y, devicePixelRatio)));
    const sw = Math.max(
      0,
      Math.min(scalePixelLength(cropRect.width, devicePixelRatio), imageWidth - sx)
    );
    const sh = Math.max(
      0,
      Math.min(scalePixelLength(cropRect.height, devicePixelRatio), imageHeight - sy)
    );

    return { sx, sy, sw, sh };
  }

  const OCR_CONFIDENCE_THRESHOLD = 70;
  const MAX_CROP_PIXELS = 16000000;
  const MAX_PREPROCESSING_PIXELS = 4000000;
  const SMALL_INPUT_MAX_EDGE = 900;
  const PREPROCESSING_PROFILES = Object.freeze(['off', 'auto', 'grayscale', 'invert']);
  const BASELINE_PREPROCESSING = Object.freeze({
    profile: 'off',
    upscale: 1,
    grayscale: false,
    invert: false,
    threshold: null
  });

  function isSafePixelDimensions(width, height, maxPixels = MAX_CROP_PIXELS) {
    return Number.isInteger(width) && Number.isInteger(height) &&
      width > 0 && height > 0 && width <= maxPixels && height <= maxPixels &&
      width * height <= maxPixels;
  }

  function assertSafePixelDimensions(width, height, maxPixels = MAX_CROP_PIXELS) {
    if (!isSafePixelDimensions(width, height, maxPixels)) {
      throw new Error('선택한 OCR 영역의 픽셀 크기가 안전 한도를 벗어났습니다.');
    }
  }

  function getUpscaleFactor(width, height) {
    assertSafePixelDimensions(width, height);
    return Math.max(width, height) <= SMALL_INPUT_MAX_EDGE &&
      isSafePixelDimensions(width * 2, height * 2) ? 2 : 1;
  }

  function toGrayscalePixels(pixels) {
    if (!pixels || pixels.length % 4 !== 0) {
      return new Uint8ClampedArray();
    }
    const result = new Uint8ClampedArray(pixels.length / 4);
    for (let pixelIndex = 0; pixelIndex < result.length; pixelIndex += 1) {
      const offset = pixelIndex * 4;
      result[pixelIndex] = Math.round(
        pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722
      );
    }
    return result;
  }

  function calculateOtsuThreshold(grayscalePixels) {
    if (!grayscalePixels || grayscalePixels.length === 0) {
      return null;
    }

    const histogram = new Uint32Array(256);
    let sum = 0;
    for (const value of grayscalePixels) {
      histogram[value] += 1;
      sum += value;
    }

    let backgroundWeight = 0;
    let backgroundSum = 0;
    let bestVariance = -1;
    let threshold = 0;
    const total = grayscalePixels.length;

    for (let level = 0; level < histogram.length; level += 1) {
      backgroundWeight += histogram[level];
      if (backgroundWeight === 0) continue;
      const foregroundWeight = total - backgroundWeight;
      if (foregroundWeight === 0) break;
      backgroundSum += level * histogram[level];
      const backgroundMean = backgroundSum / backgroundWeight;
      const foregroundMean = (sum - backgroundSum) / foregroundWeight;
      const variance = backgroundWeight * foregroundWeight *
        (backgroundMean - foregroundMean) * (backgroundMean - foregroundMean);
      if (variance > bestVariance) {
        bestVariance = variance;
        threshold = level;
      }
    }
    return threshold;
  }

  function isDarkBackground(grayscalePixels) {
    if (!grayscalePixels || grayscalePixels.length === 0) {
      return false;
    }
    const total = grayscalePixels.reduce((sum, value) => sum + value, 0);
    return total / grayscalePixels.length < 128;
  }

  function hasVisiblePixels(pixels) {
    for (let offset = 3; offset < (pixels?.length || 0); offset += 4) {
      if (pixels[offset] > 0) return true;
    }
    return false;
  }

  function transformPixels(pixels, settings) {
    const grayscale = settings?.grayscale === true;
    const invert = settings?.invert === true;
    const threshold = Number.isInteger(settings?.threshold) ? settings.threshold : null;
    if (!grayscale && !invert && threshold === null) {
      return pixels;
    }

    const result = new Uint8ClampedArray(pixels);
    const luminance = grayscale ? toGrayscalePixels(pixels) : null;
    for (let pixelIndex = 0; pixelIndex < result.length / 4; pixelIndex += 1) {
      const offset = pixelIndex * 4;
      let value = luminance ? luminance[pixelIndex] : result[offset];
      if (threshold !== null) value = value > threshold ? 255 : 0;
      if (invert) value = 255 - value;
      result[offset] = value;
      result[offset + 1] = value;
      result[offset + 2] = value;
    }
    return result;
  }

  function createPreprocessingPlan(width, height, pixels) {
    const baseline = { ...BASELINE_PREPROCESSING };
    if (width * height > MAX_PREPROCESSING_PIXELS) {
      return Object.freeze({ initial: baseline, alternate: null });
    }

    assertSafePixelDimensions(width, height);
    if (!pixels || pixels.length !== width * height * 4) {
      return Object.freeze({ initial: baseline, alternate: null });
    }

    const upscale = getUpscaleFactor(width, height);
    const grayscalePixels = toGrayscalePixels(pixels);
    const threshold = calculateOtsuThreshold(grayscalePixels);
    const darkBackground = isDarkBackground(grayscalePixels);
    let minimum = 255;
    let maximum = 0;
    for (const value of grayscalePixels) {
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
    const lowContrast = maximum - minimum < 80;
    let initial = baseline;

    if (darkBackground) {
      initial = { profile: 'invert', upscale, grayscale: true, invert: true, threshold };
    } else if (lowContrast) {
      initial = { profile: 'auto', upscale, grayscale: true, invert: false, threshold };
    } else if (upscale > 1) {
      initial = { profile: 'grayscale', upscale, grayscale: true, invert: false, threshold: null };
    }

    const alternate = initial.profile === 'off'
      ? { profile: 'auto', upscale: 1, grayscale: true, invert: false, threshold }
      : baseline;
    return Object.freeze({ initial: Object.freeze(initial), alternate: Object.freeze(alternate) });
  }

  function shouldRetryRecognition(confidence) {
    return Number.isFinite(confidence?.average) && confidence.average < OCR_CONFIDENCE_THRESHOLD;
  }

  function chooseRecognitionResult(firstData, secondData) {
    if (!secondData) return { data: firstData, attempt: 1 };
    const firstConfidence = summarizeOcrConfidence(firstData?.words).average;
    const secondConfidence = summarizeOcrConfidence(secondData?.words).average;
    return secondConfidence > firstConfidence
      ? { data: secondData, attempt: 2 }
      : { data: firstData, attempt: 1 };
  }

  async function recognizeWithCandidates(recognize, initial, alternate) {
    const firstData = await recognize(initial);
    if (!firstData || !alternate || !shouldRetryRecognition(summarizeOcrConfidence(firstData.words))) {
      return { ...chooseRecognitionResult(firstData), preprocessing: initial };
    }
    const secondData = await recognize(alternate);
    const chosen = chooseRecognitionResult(firstData, secondData);
    return {
      ...chosen,
      preprocessing: chosen.attempt === 2 ? alternate : initial
    };
  }

  function normalizePreprocessing(preprocessing) {
    if (!preprocessing || !PREPROCESSING_PROFILES.includes(preprocessing.profile)) {
      return { ...BASELINE_PREPROCESSING };
    }
    return {
      profile: preprocessing.profile,
      upscale: preprocessing.upscale === 2 ? 2 : 1,
      grayscale: preprocessing.grayscale === true,
      invert: preprocessing.invert === true,
      threshold: Number.isInteger(preprocessing.threshold) && preprocessing.threshold >= 0 && preprocessing.threshold <= 255
        ? preprocessing.threshold
        : null
    };
  }

  function summarizeOcrConfidence(words, threshold = OCR_CONFIDENCE_THRESHOLD) {
    const validWords = Array.isArray(words)
      ? words.filter((word) => word && typeof word.text === 'string' && word.text.trim() && Number.isFinite(word.confidence))
      : [];
    const confidences = validWords.map((word) => Math.min(100, Math.max(0, word.confidence)));

    if (confidences.length === 0) {
      return { average: 0, lowCount: 0, threshold };
    }

    const total = confidences.reduce((sum, confidence) => sum + confidence, 0);
    return {
      average: Math.round(total / confidences.length),
      lowCount: confidences.filter((confidence) => confidence < threshold).length,
      threshold
    };
  }

  function createOcrSuccessResponse(data, crop, timingMs, preprocessing) {
    return {
      ok: true,
      text: typeof data?.text === 'string' ? data.text.trim() : '',
      confidence: summarizeOcrConfidence(data?.words),
      preprocessing: normalizePreprocessing(preprocessing),
      timingMs: Math.max(0, Math.round(Number.isFinite(timingMs) ? timingMs : 0)),
      crop: {
        width: Math.max(0, Math.round(Number.isFinite(crop?.width) ? crop.width : 0)),
        height: Math.max(0, Math.round(Number.isFinite(crop?.height) ? crop.height : 0))
      }
    };
  }

  return Object.freeze({
    scalePixelLength,
    calculateCropBounds,
    isSafePixelDimensions,
    assertSafePixelDimensions,
    getUpscaleFactor,
    toGrayscalePixels,
    calculateOtsuThreshold,
    isDarkBackground,
    hasVisiblePixels,
    transformPixels,
    createPreprocessingPlan,
    normalizePreprocessing,
    PREPROCESSING_PROFILES,
    shouldRetryRecognition,
    chooseRecognitionResult,
    recognizeWithCandidates,
    summarizeOcrConfidence,
    createOcrSuccessResponse
  });
});
