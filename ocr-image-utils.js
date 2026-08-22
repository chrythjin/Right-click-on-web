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
  const MAX_UPSCALE_FACTOR = 2;
  const MAX_DESKEW_ANGLE = 5;
  const DESKEW_ANALYSIS_MAX_EDGE = 256;
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
      isSafePixelDimensions(width * MAX_UPSCALE_FACTOR, height * MAX_UPSCALE_FACTOR,
        MAX_PREPROCESSING_PIXELS) ? MAX_UPSCALE_FACTOR : 1;
  }

  function normalizeRotation(value) {
    return value === 90 || value === 180 || value === 270 ? value : 0;
  }

  function getRotationCandidates() {
    return Object.freeze([90, 180, 270]);
  }

  function normalizeDeskew(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.min(MAX_DESKEW_ANGLE, Math.max(-MAX_DESKEW_ANGLE, Math.round(value)));
  }

  function estimateDeskewAngle(grayscalePixels, width, height) {
    if (!grayscalePixels || grayscalePixels.length !== width * height ||
      !Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) {
      return 0;
    }

    const step = Math.max(1, Math.ceil(Math.max(width, height) / DESKEW_ANALYSIS_MAX_EDGE));
    let weight = 0;
    let sumX = 0;
    let sumY = 0;
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const darkness = 255 - grayscalePixels[y * width + x];
        weight += darkness;
        sumX += darkness * x;
        sumY += darkness * y;
      }
    }
    if (weight === 0) return 0;

    const centerX = sumX / weight;
    const centerY = sumY / weight;
    let covariance = 0;
    let horizontalVariance = 0;
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const darkness = 255 - grayscalePixels[y * width + x];
        const horizontal = x - centerX;
        covariance += darkness * horizontal * (y - centerY);
        horizontalVariance += darkness * horizontal * horizontal;
      }
    }
    if (horizontalVariance === 0) return 0;
    const angle = Math.atan(covariance / horizontalVariance) * 180 / Math.PI;
    return normalizeDeskew(-angle);
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

  function rotatePixels(pixels, width, height, rotation) {
    const normalizedRotation = normalizeRotation(rotation);
    if (normalizedRotation === 0) {
      return { pixels, width, height };
    }

    const outputWidth = normalizedRotation === 90 || normalizedRotation === 270 ? height : width;
    const outputHeight = normalizedRotation === 90 || normalizedRotation === 270 ? width : height;
    const output = new Uint8ClampedArray(pixels.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let outputX = x;
        let outputY = y;
        if (normalizedRotation === 90) {
          outputX = height - 1 - y;
          outputY = x;
        } else if (normalizedRotation === 180) {
          outputX = width - 1 - x;
          outputY = height - 1 - y;
        } else {
          outputX = y;
          outputY = width - 1 - x;
        }
        const inputOffset = (y * width + x) * 4;
        const outputOffset = (outputY * outputWidth + outputX) * 4;
        output.set(pixels.subarray(inputOffset, inputOffset + 4), outputOffset);
      }
    }
    return { pixels: output, width: outputWidth, height: outputHeight };
  }

  function deskewPixels(pixels, width, height, deskew) {
    const normalizedDeskew = normalizeDeskew(deskew);
    if (normalizedDeskew === 0) return { pixels, width, height };

    const output = new Uint8ClampedArray(pixels.length).fill(255);
    const radians = normalizedDeskew * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const centerX = (width - 1) / 2;
    const centerY = (height - 1) / 2;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const horizontal = x - centerX;
        const vertical = y - centerY;
        const sourceX = Math.round(cosine * horizontal + sine * vertical + centerX);
        const sourceY = Math.round(-sine * horizontal + cosine * vertical + centerY);
        if (sourceX < 0 || sourceX >= width || sourceY < 0 || sourceY >= height) continue;
        const inputOffset = (sourceY * width + sourceX) * 4;
        const outputOffset = (y * width + x) * 4;
        output.set(pixels.subarray(inputOffset, inputOffset + 4), outputOffset);
      }
    }
    return { pixels: output, width, height };
  }

  function upscalePixels(pixels, width, height, upscale) {
    if (upscale === 1) return { pixels, width, height };

    const outputWidth = width * upscale;
    const outputHeight = height * upscale;
    assertSafePixelDimensions(outputWidth, outputHeight, MAX_PREPROCESSING_PIXELS);
    const output = new Uint8ClampedArray(outputWidth * outputHeight * 4);
    for (let y = 0; y < outputHeight; y += 1) {
      for (let x = 0; x < outputWidth; x += 1) {
        const inputOffset = (Math.floor(y / upscale) * width + Math.floor(x / upscale)) * 4;
        const outputOffset = (y * outputWidth + x) * 4;
        output.set(pixels.subarray(inputOffset, inputOffset + 4), outputOffset);
      }
    }
    return { pixels: output, width: outputWidth, height: outputHeight };
  }

  function transformImageData(pixels, width, height, settings) {
    assertSafePixelDimensions(width, height, MAX_PREPROCESSING_PIXELS);
    if (!pixels || pixels.length !== width * height * 4) {
      throw new Error('OCR 전처리 이미지 데이터가 올바르지 않습니다.');
    }

    const preprocessing = normalizePreprocessing(settings);
    const colorPixels = transformPixels(pixels, preprocessing);
    const rotated = rotatePixels(colorPixels, width, height, preprocessing.rotation);
    const deskewed = deskewPixels(rotated.pixels, rotated.width, rotated.height, preprocessing.deskew);
    return upscalePixels(deskewed.pixels, deskewed.width, deskewed.height, preprocessing.upscale);
  }

  function createPreprocessingPlan(width, height, pixels) {
    const baseline = { ...BASELINE_PREPROCESSING };
    if (!isSafePixelDimensions(width, height) || width * height > MAX_PREPROCESSING_PIXELS) {
      return Object.freeze({ initial: Object.freeze(baseline), alternate: Object.freeze([]) });
    }
    if (!pixels || pixels.length !== width * height * 4) {
      return Object.freeze({ initial: Object.freeze(baseline), alternate: Object.freeze([]) });
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
    const candidates = [];
    const deskew = estimateDeskewAngle(grayscalePixels, width, height);
    if (width > height) {
      for (const rotation of getRotationCandidates()) {
        candidates.push({
          profile: 'grayscale', upscale: 1, grayscale: true, invert: false, threshold: null, rotation
        });
      }
    }
    if (darkBackground) {
      candidates.push({ profile: 'invert', upscale, grayscale: true, invert: true, threshold, ...(deskew ? { deskew } : {}) });
    } else if (lowContrast) {
      candidates.push({ profile: 'auto', upscale, grayscale: true, invert: false, threshold, ...(deskew ? { deskew } : {}) });
    } else if (upscale > 1 || deskew !== 0) {
      candidates.push({
        profile: 'grayscale', upscale, grayscale: true, invert: false, threshold: null, ...(deskew ? { deskew } : {})
      });
    }

    const alternates = candidates
      .filter((candidate, index, list) => list.findIndex((other) =>
        other.profile === candidate.profile && other.rotation === candidate.rotation && other.deskew === candidate.deskew
      ) === index)
      .slice(0, 2)
      .map((candidate) => Object.freeze(candidate));
    return Object.freeze({
      initial: Object.freeze(baseline),
      alternate: Object.freeze(alternates)
    });
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
    const alternates = (Array.isArray(alternate) ? alternate : [alternate])
      .filter(Boolean)
      .slice(0, 2);
    if (!firstData || alternates.length === 0 || !shouldRetryRecognition(summarizeOcrConfidence(firstData.words))) {
      return { ...chooseRecognitionResult(firstData), preprocessing: initial };
    }
    let chosen = { data: firstData, attempt: 1, preprocessing: initial };
    for (let candidateIndex = 0; candidateIndex < alternates.length; candidateIndex += 1) {
      const candidate = alternates[candidateIndex];
      const candidateData = await recognize(candidate);
      const result = chooseRecognitionResult(chosen.data, candidateData);
      if (result.attempt === 2) {
        chosen = { data: result.data, attempt: candidateIndex + 2, preprocessing: candidate };
      }
      if (!shouldRetryRecognition(summarizeOcrConfidence(chosen.data?.words))) break;
    }
    return chosen;
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
        : null,
      ...(normalizeRotation(preprocessing.rotation) ? { rotation: normalizeRotation(preprocessing.rotation) } : {}),
      ...(normalizeDeskew(preprocessing.deskew) ? { deskew: normalizeDeskew(preprocessing.deskew) } : {})
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

  const MAX_OCR_DETAIL_ITEMS = 200;
  const MAX_OCR_DETAIL_TEXT_LENGTH = 500;
  const OCR_DETAIL_HIGH_THRESHOLD = 85;

  function normalizeOcrDetailText(value) {
    if (typeof value !== 'string') return '';
    return value
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_OCR_DETAIL_TEXT_LENGTH);
  }

  function normalizeOcrDetailConfidence(value) {
    return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  }

  function normalizeOcrDetailBbox(value, crop) {
    const maxX = Math.max(0, Math.round(Number.isFinite(crop?.width) ? crop.width : 0));
    const maxY = Math.max(0, Math.round(Number.isFinite(crop?.height) ? crop.height : 0));
    const bbox = value && typeof value === 'object' ? value : {};
    const clamp = (coordinate, maximum) => Math.min(
      maximum,
      Math.max(0, Math.round(Number.isFinite(coordinate) ? coordinate : 0))
    );
    const x0 = clamp(bbox.x0, maxX);
    const y0 = clamp(bbox.y0, maxY);
    const x1 = Math.max(x0, clamp(bbox.x1, maxX));
    const y1 = Math.max(y0, clamp(bbox.y1, maxY));
    return { x0, y0, x1, y1 };
  }

  function normalizeOcrDetailItems(items, crop, maximum) {
    if (!Array.isArray(items) || maximum <= 0) return [];
    const normalized = [];
    for (const item of items) {
      const text = normalizeOcrDetailText(item?.text);
      if (!text) continue;
      normalized.push({
        text,
        confidence: normalizeOcrDetailConfidence(item.confidence),
        bbox: normalizeOcrDetailBbox(item.bbox, crop)
      });
      if (normalized.length === maximum) break;
    }
    return normalized;
  }

  function summarizeOcrDetail(data, crop) {
    const lines = Array.isArray(data?.lines) ? data.lines : [];
    const words = Array.isArray(data?.words) ? data.words : [];
    const hasLines = lines.some((item) => normalizeOcrDetailText(item?.text));
    const hasWords = words.some((item) => normalizeOcrDetailText(item?.text));
    const itemLimit = hasLines && hasWords ? MAX_OCR_DETAIL_ITEMS / 2 : MAX_OCR_DETAIL_ITEMS;
    const confidenceItems = hasWords ? words : lines;
    const confidences = confidenceItems
      .map((item) => normalizeOcrDetailText(item?.text) ? normalizeOcrDetailConfidence(item.confidence) : null)
      .filter((confidence) => confidence !== null);
    const average = confidences.length === 0
      ? 0
      : Math.round(confidences.reduce((sum, confidence) => sum + confidence, 0) / confidences.length);
    const lowCount = confidences.filter((confidence) => confidence < OCR_CONFIDENCE_THRESHOLD).length;
    const grade = average >= OCR_DETAIL_HIGH_THRESHOLD
      ? 'high'
      : average >= OCR_CONFIDENCE_THRESHOLD
        ? 'medium'
        : 'low';

    return {
      grade,
      average,
      lowCount,
      threshold: OCR_CONFIDENCE_THRESHOLD,
      lines: normalizeOcrDetailItems(lines, crop, itemLimit),
      words: normalizeOcrDetailItems(words, crop, itemLimit)
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
    estimateDeskewAngle,
    getRotationCandidates,
    toGrayscalePixels,
    calculateOtsuThreshold,
    isDarkBackground,
    hasVisiblePixels,
    transformPixels,
    transformImageData,
    createPreprocessingPlan,
    normalizePreprocessing,
    PREPROCESSING_PROFILES,
    shouldRetryRecognition,
    chooseRecognitionResult,
    recognizeWithCandidates,
    summarizeOcrConfidence,
    summarizeOcrDetail,
    createOcrSuccessResponse
  });
});
