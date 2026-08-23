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
  const MAX_OCR_ATTEMPTS = 3;
  const PROFILE_COST = Object.freeze({ off: 0, grayscale: 1, invert: 2, auto: 3 });

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

  function normalizeAttemptSummaries(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const attempts = [];
    for (const entry of value) {
      const profile = typeof entry?.profile === 'string' && OCR_PREPROCESSING_PROFILES.includes(entry.profile)
        ? entry.profile : '';
      if (!profile || seen.has(profile)) continue;
      seen.add(profile);
      attempts.push({
        profile,
        confidence: Math.max(0, Math.min(100, Math.round(finiteNumber(entry.confidence)))),
        timingMs: Math.max(0, Math.min(10 * 60 * 1000, Math.round(finiteNumber(entry.timingMs))))
      });
      if (attempts.length === MAX_OCR_ATTEMPTS) break;
    }
    return attempts;
  }

  function recommendOcrProfile(attempts) {
    const tried = new Set(normalizeAttemptSummaries(attempts).map((entry) => entry.profile));
    return Object.keys(PROFILE_COST).filter((profile) => !tried.has(profile))
      .sort((left, right) => PROFILE_COST[left] - PROFILE_COST[right] || left.localeCompare(right))[0] || null;
  }

  const OCR_PROFILE_MEMORY_KEY = 'rcowOcrProfileByHost';
  const OCR_PROFILE_MEMORY_MAX_ENTRIES = 50;
  const OCR_PROFILE_MEMORY_TTL_MS = 90 * 24 * 60 * 60 * 1000;

  function isValidProfileMemoryHostname(hostname) {
    return typeof hostname === 'string' && hostname.length > 0 && hostname.length <= 253;
  }

  function normalizeProfileMemory(value, now = Date.now()) {
    const entries = [];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const hostname of Object.keys(value)) {
        const entry = value[hostname];
        const updatedAt = Number.isFinite(entry?.updatedAt) ? entry.updatedAt : 0;
        if (!isValidProfileMemoryHostname(hostname) ||
            typeof entry?.profile !== 'string' ||
            !OCR_PREPROCESSING_PROFILES.includes(entry.profile) ||
            entry.profile === 'off' ||
            updatedAt <= 0 ||
            now - updatedAt > OCR_PROFILE_MEMORY_TTL_MS ||
            now - updatedAt < -60 * 1000) {
          continue;
        }
        entries.push([hostname, Object.freeze({ profile: entry.profile, updatedAt })]);
      }
    }
    entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt || a[0].localeCompare(b[0]));
    const out = Object.create(null);
    for (const [hostname, entry] of entries.slice(0, OCR_PROFILE_MEMORY_MAX_ENTRIES)) {
      out[hostname] = entry;
    }
    return out;
  }

  function rememberOcrProfile(memory, hostname, profile, now = Date.now()) {
    if (!isValidProfileMemoryHostname(hostname) ||
        typeof profile !== 'string' ||
        !OCR_PREPROCESSING_PROFILES.includes(profile) ||
        profile === 'off') {
      return normalizeProfileMemory(memory, now);
    }
    return normalizeProfileMemory({ ...normalizeProfileMemory(memory, now), [hostname]: { profile, updatedAt: now } }, now);
  }

  function resolveOcrProfile(memory, hostname, now = Date.now()) {
    if (!isValidProfileMemoryHostname(hostname)) {
      return null;
    }
    return normalizeProfileMemory(memory, now)[hostname]?.profile || null;
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
    const devicePixelRatio = (Number.isFinite(metadata.devicePixelRatio) && metadata.devicePixelRatio >= 0.25 && metadata.devicePixelRatio <= 8)
      ? metadata.devicePixelRatio
      : (viewport && Number.isFinite(viewport.devicePixelRatio) && viewport.devicePixelRatio >= 0.25 && viewport.devicePixelRatio <= 8)
        ? viewport.devicePixelRatio
        : null;
    if (tabId === null || !hostname || !viewport || devicePixelRatio === null || !Number.isFinite(x) || !Number.isFinite(y) ||
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
      devicePixelRatio,
      capturedAt,
      requestId,
      preprocessingProfile,
      source
    };
  }

  function normalizeLastRegionRerun(value) {
    if (!value || typeof value !== 'object') return null;
    const metadata = value && typeof value === 'object' ? value : {};
    const viewport = normalizeViewport({
      width: metadata.viewport?.width,
      height: metadata.viewport?.height,
      devicePixelRatio: metadata.viewport?.devicePixelRatio || metadata.devicePixelRatio || undefined
    });
    const rect = (metadata.cropRect ?? metadata.rect) && typeof (metadata.cropRect ?? metadata.rect) === 'object' ? (metadata.cropRect ?? metadata.rect) : {};
    const x = Number.isFinite(rect.x) ? rect.x : NaN;
    const y = Number.isFinite(rect.y) ? rect.y : NaN;
    const width = Number.isFinite(rect.width) ? rect.width : NaN;
    const height = Number.isFinite(rect.height) ? rect.height : NaN;
    const timestamp = Number.isFinite(metadata.capturedAt) ? Math.round(metadata.capturedAt) : Number.isFinite(metadata.timestamp) ? Math.round(metadata.timestamp) : 0;
    if (!Number.isInteger(metadata.tabId) || metadata.tabId < 0 || typeof metadata.hostname !== 'string' ||
        !metadata.hostname || metadata.source !== 'region' || !viewport || !Number.isFinite(x) ||
        !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height) || x < 0 || y < 0 ||
        width <= 0 || height <= 0 || x + width > viewport.width || y + height > viewport.height || timestamp <= 0) {
      const failed = [];
      if (!Number.isInteger(metadata.tabId) || metadata.tabId < 0) failed.push('tabId');
      if (typeof metadata.hostname !== 'string' || !metadata.hostname) failed.push('hostname');
      if (metadata.source !== 'region') failed.push('source:' + metadata.source);
      if (!viewport) failed.push('viewport');
      if (!Number.isFinite(x)) failed.push('x');
      if (!Number.isFinite(y)) failed.push('y');
      if (!Number.isFinite(width)) failed.push('width');
      if (!Number.isFinite(height)) failed.push('height');
      if (x < 0) failed.push('x<0');
      if (y < 0) failed.push('y<0');
      if (width <= 0) failed.push('w<=0');
      if (height <= 0) failed.push('h<=0');
      if (x + width > viewport.width) failed.push('x+w>vw');
      if (y + height > viewport.height) failed.push('y+h>vh');
      if (timestamp <= 0) failed.push('ts<=0');
      console.log('normalizeLastRegionRerun FAIL:', failed.join(', '));
      return null;
    }
    return {
      tabId: metadata.tabId,
      hostname: metadata.hostname,
      viewport: { width: viewport.width, height: viewport.height },
      rect: { x, y, width, height },
      devicePixelRatio: viewport.devicePixelRatio ?? metadata.devicePixelRatio ?? undefined,
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

  function createBboxRerunRequest(metadata, bbox, profile) {
    const normalized = normalizeCaptureMetadata(metadata);
    const safeProfile = OCR_PREPROCESSING_PROFILES.includes(profile) ? profile : '';
    if (!normalized || !safeProfile || !bbox || typeof bbox !== 'object') return null;
    const dpr = normalized.devicePixelRatio;
    const x0 = Number.isFinite(bbox.x0) ? bbox.x0 : NaN;
    const y0 = Number.isFinite(bbox.y0) ? bbox.y0 : NaN;
    const x1 = Number.isFinite(bbox.x1) ? bbox.x1 : NaN;
    const y1 = Number.isFinite(bbox.y1) ? bbox.y1 : NaN;
    if (![x0, y0, x1, y1].every(Number.isFinite) || x1 <= x0 || y1 <= y0) return null;
    const cropWidth = normalized.cropRect.width * dpr;
    const cropHeight = normalized.cropRect.height * dpr;
    if (x0 < 0 || y0 < 0 || x1 > cropWidth || y1 > cropHeight) return null;
    const cropRect = {
      x: normalized.cropRect.x + x0 / dpr,
      y: normalized.cropRect.y + y0 / dpr,
      width: (x1 - x0) / dpr,
      height: (y1 - y0) / dpr
    };
    if (cropRect.x < 0 || cropRect.y < 0 || cropRect.width <= 0 || cropRect.height <= 0 ||
        cropRect.x + cropRect.width > normalized.viewport.width || cropRect.y + cropRect.height > normalized.viewport.height) return null;
    return { cropRect, viewport: { ...normalized.viewport }, preprocessingProfile: safeProfile, source: 'region', useRequestedPreprocessing: true };
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
    const attempts = normalizeAttemptSummaries(result.attempts);
    if (attempts.length) latestResult.attempts = attempts;
    const recommendedProfile = attempts.length ? recommendOcrProfile(attempts) : null;
    if (recommendedProfile) latestResult.recommendedProfile = recommendedProfile;
    if (result.detail && typeof result.detail === 'object') {
      latestResult.detail = result.detail;
    }
    const normalizedMetadata = normalizeCaptureMetadata(metadata);
    if (normalizedMetadata) {
      latestResult.metadata = normalizedMetadata;
    }
    return latestResult;
  }

  function normalizeOcrProgress(value) {
    return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  }

  function normalizeOcrPhase(value) {
    return typeof value === 'string'
      ? value.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim().slice(0, 80)
      : '';
  }

  function createOcrStatus(state, error = '', requestId = 0, progress = null, phase = '') {
    const status = { state };
    if (Number.isInteger(requestId) && requestId > 0) {
      status.requestId = requestId;
    }
    if (state === 'error') {
      status.error = typeof error === 'string' ? error : String(error || 'OCR 처리 오류');
    }
    if (state === 'loading' && progress !== null) {
      status.progress = normalizeOcrProgress(progress);
      const normalizedPhase = normalizeOcrPhase(phase);
      if (normalizedPhase) status.phase = normalizedPhase;
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
    const requestId = Number.isInteger(event.requestId) ? event.requestId : 0;
    const currentRequestId = getOcrRequestId(previous);
    const currentStatus = previous[LATEST_OCR_STATUS_KEY] || null;
    if (requestId && (requestId < currentRequestId ||
        (requestId === currentRequestId && currentStatus?.state === 'cancelled' && event.type !== 'cancelled'))) {
      return {
        [LATEST_OCR_RESULT_KEY]: latestOcrResult,
        [LATEST_OCR_STATUS_KEY]: currentStatus
      };
    }
    if (event.type === 'success') {
      const normalized = createLatestOcrResult(event.result, event.source, event.metadata);
      return {
        [LATEST_OCR_RESULT_KEY]: normalized || latestOcrResult,
        [LATEST_OCR_STATUS_KEY]: createOcrStatus(normalized ? 'success' : 'error', 'OCR 결과가 올바르지 않습니다.', requestId)
      };
    }
    if (event.type === 'error') {
      return {
        [LATEST_OCR_RESULT_KEY]: latestOcrResult,
        [LATEST_OCR_STATUS_KEY]: createOcrStatus('error', event.error, requestId)
      };
    }
    if (event.type === 'loading') {
      return {
        [LATEST_OCR_RESULT_KEY]: latestOcrResult,
        [LATEST_OCR_STATUS_KEY]: createOcrStatus('loading', '', requestId, event.progress, event.phase)
      };
    }
    if (event.type === 'cancelled') {
      return {
        [LATEST_OCR_RESULT_KEY]: latestOcrResult,
        [LATEST_OCR_STATUS_KEY]: createOcrStatus('cancelled', '', requestId)
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

  const INCOGNITO_CAPTURE_DISABLED_MESSAGE =
    '시크릿 모드에서는 화면 캡처가 차단되어 있습니다. chrome://extensions에서 이 확장의 "시크릿 모드에서 허용"을 켠 뒤 다시 시도하세요.';
  const CAPTURE_DISABLED_MESSAGE =
    '이 페이지 또는 이 환경에서는 화면 캡처가 비활성화되어 있습니다. 브라우저 정책 또는 보안 프로그램이 캡처를 차단했을 수 있습니다.';
  const PROTECTED_PAGE_MESSAGE =
    '브라우저 내부 페이지(chrome://, 확장 관리 페이지, 웹 스토어 등)에서는 화면 캡처를 사용할 수 없습니다.';
  const CAPTURE_PERMISSION_MESSAGE =
    '화면 캡처 권한이 부족해 인식할 수 없습니다. 확장 권한 설정을 확인한 뒤 다시 시도하세요.';

  function classifyOcrCaptureFailure(rawMessage, context = {}) {
    const message = typeof rawMessage === 'string' && rawMessage.trim()
      ? rawMessage
      : 'OCR 화면 캡처에 실패했습니다.';
    const lower = message.toLowerCase();
    if (lower.includes('screenshots has been disabled') ||
        (lower.includes('screenshot') && lower.includes('disabled'))) {
      if (context?.incognito === true && context?.incognitoAllowed === false) {
        return INCOGNITO_CAPTURE_DISABLED_MESSAGE;
      }
      return CAPTURE_DISABLED_MESSAGE;
    }
    if (lower.includes('cannot access') || lower.includes('chrome://') ||
        lower.includes('chrome url') || lower.includes('web store') ||
        lower.includes('cannot be inspected')) {
      return PROTECTED_PAGE_MESSAGE;
    }
    if (lower.includes('all_urls') || lower.includes('permission') ||
        lower.includes('not allowed') || lower.includes('not permitted')) {
      return CAPTURE_PERMISSION_MESSAGE;
    }
    return message;
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
    MAX_OCR_ATTEMPTS,
    MAX_CAPTURE_AGE_MS,
    normalizeOcrSource,
    normalizeAttemptSummaries,
    recommendOcrProfile,
    OCR_PROFILE_MEMORY_KEY,
    OCR_PROFILE_MEMORY_MAX_ENTRIES,
    OCR_PROFILE_MEMORY_TTL_MS,
    normalizeProfileMemory,
    rememberOcrProfile,
    resolveOcrProfile,
    createLatestOcrResult,
    normalizeCaptureMetadata,
    normalizeLastRegionRerun,
    getOcrRequestId,
    validateOcrRerun,
    validateLastRegionRerun,
    createOcrRerunRequest,
    createLastRegionRerunRequest,
    createBboxRerunRequest,
    reduceOcrSessionState,
    createOcrUiState,
    applyOcrSessionSnapshot,
    applyOcrSessionChanges,
    computeOcrEditPendingState,
    classifyOcrCaptureFailure
  });
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RIGHT_CLICK_ON_WEB_OCR_SESSION_UTILS;
} else if (typeof globalThis !== 'undefined') {
  globalThis.RIGHT_CLICK_ON_WEB_OCR_SESSION_UTILS = RIGHT_CLICK_ON_WEB_OCR_SESSION_UTILS;
}
