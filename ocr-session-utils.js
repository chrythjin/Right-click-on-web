const RIGHT_CLICK_ON_WEB_OCR_SESSION_UTILS = (() => {
  'use strict';

  const LATEST_OCR_RESULT_KEY = 'latestOcrResult';
  const LATEST_OCR_STATUS_KEY = 'latestOcrStatus';
  const LAST_REGION_RERUN_KEY = 'lastRegionRerun';
  const OCR_SESSION_KEYS = Object.freeze([
    LATEST_OCR_RESULT_KEY,
    LATEST_OCR_STATUS_KEY,
    LAST_REGION_RERUN_KEY
  ]);
  const OCR_PREPROCESSING_PROFILES = Object.freeze(['off', 'auto', 'grayscale', 'invert']);
  const OCR_SOURCES = Object.freeze(['region', 'image']);
  const MAX_CAPTURE_AGE_MS = 24 * 60 * 60 * 1000;

  function normalizeOcrSource(value) {
    return typeof value === 'string' && OCR_SOURCES.includes(value) ? value : 'region';
  }

  function finiteNumber(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
  }

  function normalizeConfidence(value) {
    const confidence = value && typeof value === 'object' ? value : {};
    return {
      average: finiteNumber(confidence.average),
      lowCount: finiteNumber(confidence.lowCount),
      threshold: finiteNumber(confidence.threshold)
    };
  }

  function normalizePreprocessing(value) {
    const preprocessing = value && typeof value === 'object' ? value : {};
    return {
      profile: typeof preprocessing.profile === 'string' ? preprocessing.profile : 'off',
      upscale: finiteNumber(preprocessing.upscale, 1),
      grayscale: preprocessing.grayscale === true,
      invert: preprocessing.invert === true,
      threshold: Number.isFinite(preprocessing.threshold) ? preprocessing.threshold : null
    };
  }

  function normalizeCrop(value) {
    const crop = value && typeof value === 'object' ? value : {};
    return {
      width: finiteNumber(crop.width),
      height: finiteNumber(crop.height)
    };
  }

  function normalizeViewport(value) {
    const viewport = value && typeof value === 'object' ? value : {};
    const width = Number.isInteger(viewport.width) ? viewport.width : 0;
    const height = Number.isInteger(viewport.height) ? viewport.height : 0;
    const devicePixelRatio = Number.isFinite(viewport.devicePixelRatio) ? viewport.devicePixelRatio : 0;
    if (width <= 0 || height <= 0 || devicePixelRatio < 0.25 || devicePixelRatio > 8) {
      return null;
    }
    return { width, height, devicePixelRatio };
  }

  function normalizeCaptureMetadata(value) {
    const metadata = value && typeof value === 'object' ? value : {};
    const tabId = Number.isInteger(metadata.tabId) && metadata.tabId >= 0 ? metadata.tabId : null;
    const hostname = typeof metadata.hostname === 'string' ? metadata.hostname : '';
    const viewport = normalizeViewport(metadata.viewport);
    const cropRect = metadata.cropRect && typeof metadata.cropRect === 'object' ? metadata.cropRect : {};
    const x = Number.isFinite(cropRect.x) ? cropRect.x : NaN;
    const y = Number.isFinite(cropRect.y) ? cropRect.y : NaN;
    const width = Number.isFinite(cropRect.width) ? cropRect.width : NaN;
    const height = Number.isFinite(cropRect.height) ? cropRect.height : NaN;
    const capturedAt = Number.isFinite(metadata.capturedAt) ? Math.round(metadata.capturedAt) : 0;
    const requestId = Number.isInteger(metadata.requestId) && metadata.requestId > 0 ? metadata.requestId : 0;
    const source = normalizeOcrSource(metadata.source);
    const preprocessingProfile = OCR_PREPROCESSING_PROFILES.includes(metadata.preprocessingProfile)
      ? metadata.preprocessingProfile
      : '';
    if (tabId === null || !hostname || !viewport || !Number.isFinite(x) || !Number.isFinite(y) ||
        !Number.isFinite(width) || !Number.isFinite(height) || x < 0 || y < 0 ||
        width <= 0 || height <= 0 || x + width > viewport.width || y + height > viewport.height ||
        capturedAt <= 0 || !requestId || !preprocessingProfile) {
      return null;
    }
    return {
      tabId,
      hostname,
      viewport,
      cropRect: { x, y, width, height },
      devicePixelRatio: viewport.devicePixelRatio,
      capturedAt,
      requestId,
      preprocessingProfile,
      source
    };
  }

  function normalizeLastRegionRerun(value) {
    const captured = normalizeCaptureMetadata(value);
    if (captured && captured.source === 'region') {
      return {
        tabId: captured.tabId,
        hostname: captured.hostname,
        viewport: { width: captured.viewport.width, height: captured.viewport.height },
        rect: { ...captured.cropRect },
        devicePixelRatio: captured.devicePixelRatio,
        source: 'region',
        timestamp: captured.capturedAt
      };
    }

    const metadata = value && typeof value === 'object' ? value : {};
    const viewport = normalizeViewport({
      width: metadata.viewport?.width,
      height: metadata.viewport?.height,
      devicePixelRatio: metadata.devicePixelRatio
    });
    const rect = metadata.rect && typeof metadata.rect === 'object' ? metadata.rect : {};
    const x = Number.isFinite(rect.x) ? rect.x : NaN;
    const y = Number.isFinite(rect.y) ? rect.y : NaN;
    const width = Number.isFinite(rect.width) ? rect.width : NaN;
    const height = Number.isFinite(rect.height) ? rect.height : NaN;
    const timestamp = Number.isFinite(metadata.timestamp) ? Math.round(metadata.timestamp) : 0;
    if (!Number.isInteger(metadata.tabId) || metadata.tabId < 0 || typeof metadata.hostname !== 'string' ||
        !metadata.hostname || metadata.source !== 'region' || !viewport || !Number.isFinite(x) ||
        !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height) || x < 0 || y < 0 ||
        width <= 0 || height <= 0 || x + width > viewport.width || y + height > viewport.height || timestamp <= 0) {
      return null;
    }
    return {
      tabId: metadata.tabId,
      hostname: metadata.hostname,
      viewport: { width: viewport.width, height: viewport.height },
      rect: { x, y, width, height },
      devicePixelRatio: viewport.devicePixelRatio,
      source: 'region',
      timestamp
    };
  }

  function getOcrRequestId(state) {
    const resultRequestId = state?.[LATEST_OCR_RESULT_KEY]?.metadata?.requestId;
    const statusRequestId = state?.[LATEST_OCR_STATUS_KEY]?.requestId;
    return Math.max(
      Number.isInteger(resultRequestId) ? resultRequestId : 0,
      Number.isInteger(statusRequestId) ? statusRequestId : 0
    );
  }

  function validateOcrRerun(metadata, activeTab, currentViewport, now = Date.now()) {
    const normalized = normalizeCaptureMetadata(metadata);
    const viewport = normalizeViewport(currentViewport);
    if (!normalized) {
      return { ok: false, error: '저장된 OCR 영역 정보가 올바르지 않습니다.' };
    }
    if (!Number.isInteger(activeTab?.id) || activeTab.id !== normalized.tabId ||
        activeTab.hostname !== normalized.hostname) {
      return { ok: false, error: '원래 탭에서 다시 시도하세요.' };
    }
    if (!viewport || viewport.width !== normalized.viewport.width ||
        viewport.height !== normalized.viewport.height ||
        viewport.devicePixelRatio !== normalized.devicePixelRatio) {
      return { ok: false, error: '현재 화면 크기 또는 확대 비율이 달라 다시 인식할 수 없습니다.' };
    }
    if (normalized.capturedAt > now + 60 * 1000 || now - normalized.capturedAt > MAX_CAPTURE_AGE_MS) {
      return { ok: false, error: '저장된 OCR 결과가 너무 오래되어 다시 인식할 수 없습니다.' };
    }
    return { ok: true, metadata: normalized };
  }

  function validateLastRegionRerun(value, activeTab, currentViewport, now = Date.now()) {
    const metadata = normalizeLastRegionRerun(value);
    if (!metadata) {
      return { ok: false, error: '저장된 마지막 영역 정보가 올바르지 않습니다.' };
    }
    if (!Number.isInteger(activeTab?.id) || activeTab.id !== metadata.tabId || activeTab.hostname !== metadata.hostname) {
      return { ok: false, error: '원래 탭에서 다시 시도하세요.' };
    }
    if (!currentViewport || currentViewport.width !== metadata.viewport.width || currentViewport.height !== metadata.viewport.height ||
        currentViewport.devicePixelRatio !== metadata.devicePixelRatio) {
      return { ok: false, error: '현재 화면 크기 또는 확대 비율이 달라 다시 인식할 수 없습니다.' };
    }
    if (metadata.timestamp > now + 60 * 1000 || now - metadata.timestamp > MAX_CAPTURE_AGE_MS) {
      return { ok: false, error: '저장된 OCR 결과가 너무 오래되어 다시 인식할 수 없습니다.' };
    }
    return {
      ok: true,
      metadata
    };
  }

  function createOcrRerunRequest(metadata) {
    const normalized = normalizeCaptureMetadata(metadata);
    if (!normalized) {
      return null;
    }
    return {
      cropRect: { ...normalized.cropRect },
      viewport: { ...normalized.viewport },
      preprocessingProfile: normalized.preprocessingProfile,
      source: normalized.source,
      useRequestedPreprocessing: true
    };
  }

  function createLastRegionRerunRequest(metadata) {
    const normalized = normalizeLastRegionRerun(metadata);
    if (!normalized) return null;
    return {
      cropRect: { ...normalized.rect },
      viewport: { ...normalized.viewport, devicePixelRatio: normalized.devicePixelRatio },
      preprocessingProfile: 'off',
      source: 'region',
      useRequestedPreprocessing: true
    };
  }

  function createLatestOcrResult(result, source = 'region', metadata = null) {
    if (!result || result.ok !== true) {
      return null;
    }
    const latestResult = {
      text: typeof result.text === 'string' ? result.text : '',
      confidence: normalizeConfidence(result.confidence),
      preprocessing: normalizePreprocessing(result.preprocessing),
      crop: normalizeCrop(result.crop),
      source: normalizeOcrSource(source)
    };
    const normalizedMetadata = normalizeCaptureMetadata(metadata);
    if (normalizedMetadata) {
      latestResult.metadata = normalizedMetadata;
    }
    return latestResult;
  }

  function createOcrStatus(state, error = '', requestId = 0) {
    const status = { state };
    if (Number.isInteger(requestId) && requestId > 0) {
      status.requestId = requestId;
    }
    if (state === 'error') {
      status.error = typeof error === 'string' ? error : String(error || 'OCR 처리 오류');
    }
    return status;
  }

  function reduceOcrSessionState(previousState, event) {
    const previous = previousState && typeof previousState === 'object' ? previousState : {};
    const latestOcrResult = previous[LATEST_OCR_RESULT_KEY] || null;
    if (!event || typeof event !== 'object') {
      return {
        [LATEST_OCR_RESULT_KEY]: latestOcrResult,
        [LATEST_OCR_STATUS_KEY]: previous[LATEST_OCR_STATUS_KEY] || null
      };
    }
    if (event.type === 'success') {
      const requestId = Number.isInteger(event.requestId) ? event.requestId : 0;
      if (requestId && requestId < getOcrRequestId(previous)) {
        return {
          [LATEST_OCR_RESULT_KEY]: latestOcrResult,
          [LATEST_OCR_STATUS_KEY]: previous[LATEST_OCR_STATUS_KEY] || null
        };
      }
      const normalized = createLatestOcrResult(event.result, event.source, event.metadata);
      return {
        [LATEST_OCR_RESULT_KEY]: normalized || latestOcrResult,
        [LATEST_OCR_STATUS_KEY]: createOcrStatus(normalized ? 'success' : 'error', 'OCR 결과가 올바르지 않습니다.', requestId)
      };
    }
    if (event.type === 'error') {
      const requestId = Number.isInteger(event.requestId) ? event.requestId : 0;
      if (requestId && requestId < getOcrRequestId(previous)) {
        return {
          [LATEST_OCR_RESULT_KEY]: latestOcrResult,
          [LATEST_OCR_STATUS_KEY]: previous[LATEST_OCR_STATUS_KEY] || null
        };
      }
      return {
        [LATEST_OCR_RESULT_KEY]: latestOcrResult,
        [LATEST_OCR_STATUS_KEY]: createOcrStatus('error', event.error, requestId)
      };
    }
    if (event.type === 'loading') {
      const requestId = Number.isInteger(event.requestId) ? event.requestId : 0;
      if (requestId && requestId < getOcrRequestId(previous)) {
        return {
          [LATEST_OCR_RESULT_KEY]: latestOcrResult,
          [LATEST_OCR_STATUS_KEY]: previous[LATEST_OCR_STATUS_KEY] || null
        };
      }
      return {
        [LATEST_OCR_RESULT_KEY]: latestOcrResult,
        [LATEST_OCR_STATUS_KEY]: createOcrStatus('loading', '', requestId)
      };
    }
    return {
      [LATEST_OCR_RESULT_KEY]: latestOcrResult,
      [LATEST_OCR_STATUS_KEY]: previous[LATEST_OCR_STATUS_KEY] || null
    };
  }

  function createOcrUiState() {
    return {
      supported: true,
      latestOcrResult: null,
      latestOcrStatus: null,
      lastRegionRerun: null
    };
  }

  function applyOcrSessionSnapshot(currentState, snapshot) {
    if (snapshot === null) {
      return { supported: false, latestOcrResult: null, latestOcrStatus: null, lastRegionRerun: null };
    }
    const next = snapshot && typeof snapshot === 'object' ? snapshot : {};
    return {
      supported: true,
      latestOcrResult: next[LATEST_OCR_RESULT_KEY] || null,
      latestOcrStatus: next[LATEST_OCR_STATUS_KEY] || null,
      lastRegionRerun: normalizeLastRegionRerun(next[LAST_REGION_RERUN_KEY])
    };
  }

  function applyOcrSessionChanges(currentState, changes) {
    const current = currentState && typeof currentState === 'object'
      ? currentState
      : createOcrUiState();
    const next = {
      supported: true,
      latestOcrResult: current.latestOcrResult || null,
      latestOcrStatus: current.latestOcrStatus || null,
      lastRegionRerun: current.lastRegionRerun || null
    };
    if (changes && changes[LATEST_OCR_RESULT_KEY]) {
      next.latestOcrResult = changes[LATEST_OCR_RESULT_KEY].newValue || null;
    }
    if (changes && changes[LATEST_OCR_STATUS_KEY]) {
      next.latestOcrStatus = changes[LATEST_OCR_STATUS_KEY].newValue || null;
    }
    if (changes && changes[LAST_REGION_RERUN_KEY]) {
      next.lastRegionRerun = normalizeLastRegionRerun(changes[LAST_REGION_RERUN_KEY].newValue);
    }
    return next;
  }

  function computeOcrEditPendingState({
    ocrOriginalText,
    ocrIsDirty,
    ocrPendingNewResultText,
    ocrDismissedResultText
  }, rawText) {
    if (!ocrIsDirty) {
      return {
        newOriginalText: rawText,
        newEditedText: rawText,
        newIsDirty: false,
        newPendingText: null,
        newDismissedResultText: null,
        showBanner: false
      };
    }

    if (rawText === ocrOriginalText) {
      return {
        newOriginalText: ocrOriginalText,
        newEditedText: ocrOriginalText,
        newIsDirty: true,
        newPendingText: ocrPendingNewResultText,
        newDismissedResultText: ocrDismissedResultText,
        showBanner: false
      };
    }

    const isSameAsPending = rawText === ocrPendingNewResultText;
    const isSameAsDismissed = rawText === ocrDismissedResultText;

    if (isSameAsPending || isSameAsDismissed) {
      return {
        newOriginalText: ocrOriginalText,
        newEditedText: ocrOriginalText,
        newIsDirty: true,
        newPendingText: isSameAsPending ? ocrPendingNewResultText : null,
        newDismissedResultText: ocrDismissedResultText,
        showBanner: false
      };
    }

    return {
      newOriginalText: ocrOriginalText,
      newEditedText: ocrOriginalText,
      newIsDirty: true,
      newPendingText: rawText,
      newDismissedResultText: ocrDismissedResultText,
      showBanner: true
    };
  }

  return Object.freeze({
    LATEST_OCR_RESULT_KEY,
    LATEST_OCR_STATUS_KEY,
    LAST_REGION_RERUN_KEY,
    OCR_SESSION_KEYS,
    OCR_PREPROCESSING_PROFILES,
    OCR_SOURCES,
    MAX_CAPTURE_AGE_MS,
    normalizeOcrSource,
    createLatestOcrResult,
    normalizeCaptureMetadata,
    normalizeLastRegionRerun,
    getOcrRequestId,
    validateOcrRerun,
    validateLastRegionRerun,
    createOcrRerunRequest,
    createLastRegionRerunRequest,
    reduceOcrSessionState,
    createOcrUiState,
    applyOcrSessionSnapshot,
    applyOcrSessionChanges,
    computeOcrEditPendingState
  });
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RIGHT_CLICK_ON_WEB_OCR_SESSION_UTILS;
} else if (typeof globalThis !== 'undefined') {
  globalThis.RIGHT_CLICK_ON_WEB_OCR_SESSION_UTILS = RIGHT_CLICK_ON_WEB_OCR_SESSION_UTILS;
}
