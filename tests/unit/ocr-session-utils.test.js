'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  LATEST_OCR_RESULT_KEY,
  LATEST_OCR_STATUS_KEY,
  OCR_SOURCES,
  normalizeOcrSource,
  createLatestOcrResult,
  normalizeCaptureMetadata,
  normalizeLastRegionRerun,
  validateOcrRerun,
  validateLastRegionRerun,
  createOcrRerunRequest,
  createLastRegionRerunRequest,
  reduceOcrSessionState,
  createOcrUiState,
  applyOcrSessionSnapshot,
  applyOcrSessionChanges,
  computeOcrEditPendingState
} = require('../../ocr-session-utils.js');

function successfulOcrResult(overrides = {}) {
  return {
    ok: true,
    text: '안전한 OCR 텍스트',
    confidence: { average: 94.5, lowCount: 1, threshold: 50 },
    preprocessing: {
      profile: 'contrast',
      upscale: 2,
      grayscale: true,
      invert: false,
      threshold: 140,
      dataUrl: 'data:image/png;base64,unsafe'
    },
    crop: { width: 320, height: 180, pixels: new Uint8Array([1, 2, 3]) },
    dataUrl: 'data:image/png;base64,unsafe',
    screenshot: 'unsafe',
    fullUrl: 'https://private.example/path',
    timingMs: 120,
    ...overrides
  };
}

function captureMetadata(overrides = {}) {
  return {
    tabId: 42,
    hostname: 'example.test',
    viewport: { width: 1280, height: 720, devicePixelRatio: 2 },
    cropRect: { x: 80, y: 120, width: 320, height: 180 },
    capturedAt: 1_000_000,
    requestId: 7,
    preprocessingProfile: 'auto',
    source: 'region',
    fullUrl: 'https://example.test/private?secret=never-stored',
    dataUrl: 'data:image/png;base64,unsafe',
    ...overrides
  };
}

test('successful OCR is normalized to the exact user-safe top-level allowlist', () => {
  const record = createLatestOcrResult(successfulOcrResult(), {
    fullUrl: 'https://private.example/path',
    arbitrary: true
  });

  assert.deepEqual(Object.keys(record), ['text', 'confidence', 'preprocessing', 'crop', 'source']);
  assert.deepEqual(record.confidence, { average: 94.5, lowCount: 1, threshold: 50 });
  assert.deepEqual(record.preprocessing, {
    profile: 'contrast',
    upscale: 2,
    grayscale: true,
    invert: false,
    threshold: 140
  });
  assert.deepEqual(record.crop, { width: 320, height: 180 });
  assert.equal(record.source, 'region');
  assert.equal(JSON.stringify(record).includes('data:image'), false);
  assert.equal(JSON.stringify(record).includes('private.example'), false);
  assert.equal(JSON.stringify(record).includes('pixels'), false);
});

test('OCR source contract preserves region and image while safely normalizing legacy and malformed values', () => {
  assert.deepEqual(OCR_SOURCES, ['region', 'image']);
  assert.equal(normalizeOcrSource('region'), 'region');
  assert.equal(normalizeOcrSource('image'), 'image');
  assert.equal(normalizeOcrSource('visible-tab'), 'region');
  assert.equal(normalizeOcrSource({ source: 'image' }), 'region');
  assert.equal(createLatestOcrResult(successfulOcrResult(), 'image').source, 'image');
  assert.equal(createLatestOcrResult(successfulOcrResult(), 'visible-tab').source, 'region');
});

test('failed OCR cannot create or overwrite the latest successful result', () => {
  const successState = reduceOcrSessionState({}, {
    type: 'success',
    result: successfulOcrResult(),
    source: 'region'
  });
  const failedState = reduceOcrSessionState(successState, {
    type: 'error',
    error: '인식 실패'
  });

  assert.strictEqual(failedState[LATEST_OCR_RESULT_KEY], successState[LATEST_OCR_RESULT_KEY]);
  assert.deepEqual(failedState[LATEST_OCR_STATUS_KEY], {
    state: 'error',
    error: '인식 실패'
  });
  assert.equal(createLatestOcrResult({ ok: false, text: 'unsafe' }), null);
});

test('loading state preserves the prior success and remains observable', () => {
  const previousResult = createLatestOcrResult(successfulOcrResult(), 'region');
  const next = reduceOcrSessionState({
    [LATEST_OCR_RESULT_KEY]: previousResult,
    [LATEST_OCR_STATUS_KEY]: { state: 'success' }
  }, { type: 'loading' });

  assert.strictEqual(next[LATEST_OCR_RESULT_KEY], previousResult);
  assert.deepEqual(next[LATEST_OCR_STATUS_KEY], { state: 'loading' });
});

test('unsupported session storage disables and clears the OCR UI state', () => {
  const prior = {
    supported: true,
    latestOcrResult: createLatestOcrResult(successfulOcrResult(), 'region'),
    latestOcrStatus: { state: 'success' }
  };

  assert.deepEqual(applyOcrSessionSnapshot(prior, null), {
    supported: false,
    latestOcrResult: null,
    latestOcrStatus: null,
    lastRegionRerun: null
  });
});

test('initial snapshot and partial change events apply without losing unchanged state', () => {
  const result = createLatestOcrResult(successfulOcrResult(), 'region');
  const loaded = applyOcrSessionSnapshot(createOcrUiState(), {
    [LATEST_OCR_RESULT_KEY]: result,
    [LATEST_OCR_STATUS_KEY]: { state: 'success' }
  });
  const loading = applyOcrSessionChanges(loaded, {
    [LATEST_OCR_STATUS_KEY]: {
      oldValue: { state: 'success' },
      newValue: { state: 'loading' }
    }
  });
  const changedResult = { ...result, text: '변경된 텍스트' };
  const changed = applyOcrSessionChanges(loading, {
    [LATEST_OCR_RESULT_KEY]: {
      oldValue: result,
      newValue: changedResult
    }
  });

  assert.strictEqual(loading.latestOcrResult, result);
  assert.deepEqual(loading.latestOcrStatus, { state: 'loading' });
  assert.strictEqual(changed.latestOcrResult, changedResult);
  assert.deepEqual(changed.latestOcrStatus, { state: 'loading' });
});

test('incoming OCR result does not silently overwrite active edits when user is editing', () => {
  const result1 = createLatestOcrResult(successfulOcrResult({ text: '첫 결과' }), 'region');
  const loaded = applyOcrSessionSnapshot(createOcrUiState(), {
    [LATEST_OCR_RESULT_KEY]: result1,
    [LATEST_OCR_STATUS_KEY]: { state: 'success' }
  });

  const result2 = createLatestOcrResult(successfulOcrResult({ text: '둘째 결과' }), 'region');
  const changed = applyOcrSessionChanges(loaded, {
    [LATEST_OCR_RESULT_KEY]: {
      oldValue: result1,
      newValue: result2
    }
  });

  assert.strictEqual(changed.latestOcrResult, result2);
});

test('no result state renders empty without crashing', () => {
  const uiState = createOcrUiState();
  assert.strictEqual(uiState.supported, true);
  assert.strictEqual(uiState.latestOcrResult, null);
  assert.strictEqual(uiState.latestOcrStatus, null);
});

test('session storage unavailable returns null snapshot', () => {
  const snapshot = applyOcrSessionSnapshot(createOcrUiState(), null);
  assert.deepEqual(snapshot, {
    supported: false,
    latestOcrResult: null,
    latestOcrStatus: null,
    lastRegionRerun: null
  });
});

test('low confidence warning is emitted for average below 70', () => {
  const lowConfResult = createLatestOcrResult(
    successfulOcrResult({ confidence: { average: 55, lowCount: 3, threshold: 50 } }),
    'region'
  );
  const loaded = applyOcrSessionSnapshot(createOcrUiState(), {
    [LATEST_OCR_RESULT_KEY]: lowConfResult,
    [LATEST_OCR_STATUS_KEY]: { state: 'success' }
  });

  assert.strictEqual(loaded.latestOcrResult.confidence.average, 55);
  assert.strictEqual(loaded.latestOcrResult.confidence.lowCount, 3);
});

test('OCR result normalization strips disallowed keys from nested objects', () => {
  const raw = successfulOcrResult({
    preprocessing: {
      profile: 'off',
      dataUrl: 'https://evil.example/steal',
      arbitraryField: 'should be removed'
    },
    crop: {
      width: 100,
      height: 200,
      pixels: new Uint8Array([9, 8, 7])
    }
  });
  const normalized = createLatestOcrResult(raw, 'region');

  assert.equal(JSON.stringify(normalized).includes('evil.example'), false);
  assert.equal(JSON.stringify(normalized).includes('arbitraryField'), false);
  assert.equal(JSON.stringify(normalized).includes('pixels'), false);
  assert.deepEqual(normalized.preprocessing, {
    profile: 'off',
    upscale: 1,
    grayscale: false,
    invert: false,
    threshold: null
  });
  assert.deepEqual(normalized.crop, { width: 100, height: 200 });
});

test('createLatestOcrResult normalizes malformed confidence gracefully', () => {
  const raw1 = successfulOcrResult({ confidence: null });
  const norm1 = createLatestOcrResult(raw1, 'region');
  assert.deepEqual(norm1.confidence, { average: 0, lowCount: 0, threshold: 0 });

  const raw2 = successfulOcrResult({ confidence: 'bad' });
  const norm2 = createLatestOcrResult(raw2, 'region');
  assert.deepEqual(norm2.confidence, { average: 0, lowCount: 0, threshold: 0 });

  const raw3 = successfulOcrResult({ confidence: { average: 85 } });
  const norm3 = createLatestOcrResult(raw3, 'region');
  assert.deepEqual(norm3.confidence, { average: 85, lowCount: 0, threshold: 0 });

  const raw4 = successfulOcrResult({ confidence: { average: NaN, lowCount: 2, threshold: 60 } });
  const norm4 = createLatestOcrResult(raw4, 'region');
  assert.strictEqual(norm4.confidence.average, 0);
  assert.strictEqual(norm4.confidence.lowCount, 2);
  assert.strictEqual(norm4.confidence.threshold, 60);
});

test('latest OCR result stores only allowlisted same-area rerun metadata', () => {
  const record = createLatestOcrResult(successfulOcrResult(), 'image', captureMetadata({ source: 'image' }));

  assert.deepEqual(record.metadata, {
    tabId: 42,
    hostname: 'example.test',
    viewport: { width: 1280, height: 720, devicePixelRatio: 2 },
    cropRect: { x: 80, y: 120, width: 320, height: 180 },
    devicePixelRatio: 2,
    capturedAt: 1_000_000,
    requestId: 7,
    preprocessingProfile: 'auto',
    source: 'image'
  });
  assert.equal(JSON.stringify(record).includes('private?secret'), false);
  assert.equal(JSON.stringify(record).includes('data:image'), false);
});

test('same-area rerun rejects tab, hostname, viewport, rect, DPR, and profile mismatches', () => {
  const metadata = captureMetadata();
  const activeTab = { id: 42, hostname: 'example.test' };
  const viewport = { width: 1280, height: 720, devicePixelRatio: 2 };

  assert.equal(validateOcrRerun(metadata, activeTab, viewport, 1_000_100).ok, true);
  assert.equal(validateOcrRerun(metadata, { ...activeTab, id: 99 }, viewport, 1_000_100).ok, false);
  assert.equal(validateOcrRerun(metadata, { ...activeTab, hostname: 'other.test' }, viewport, 1_000_100).ok, false);
  assert.equal(validateOcrRerun(metadata, activeTab, { ...viewport, width: 1279 }, 1_000_100).ok, false);
  assert.equal(validateOcrRerun(metadata, activeTab, { ...viewport, devicePixelRatio: 1 }, 1_000_100).ok, false);
  assert.equal(normalizeCaptureMetadata(captureMetadata({ cropRect: { x: 1000, y: 120, width: 320, height: 180 } })), null);
  assert.equal(normalizeCaptureMetadata(captureMetadata({ preprocessingProfile: 'unsafe-profile' })), null);
});

test('accepted same-area rerun routes only fresh capture primitives', () => {
  const request = createOcrRerunRequest(captureMetadata({ source: 'image' }));

  assert.deepEqual(request, {
    cropRect: { x: 80, y: 120, width: 320, height: 180 },
    viewport: { width: 1280, height: 720, devicePixelRatio: 2 },
    preprocessingProfile: 'auto',
    source: 'image',
    useRequestedPreprocessing: true
  });
  assert.equal(JSON.stringify(request).includes('data:image'), false);
  assert.equal(JSON.stringify(request).includes('example.test'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(request, 'dataUrl'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(request, 'srcUrl'), false);
});

test('last region rerun metadata is a fresh immutable allowlist with no OCR payload or URL fields', () => {
  const stored = normalizeLastRegionRerun(captureMetadata({
    source: 'region',
    fullUrl: 'https://example.test/private?secret=never-stored',
    dataUrl: 'data:image/png;base64,unsafe',
    text: 'unsafe OCR text'
  }));

  assert.deepEqual(stored, {
    tabId: 42,
    hostname: 'example.test',
    viewport: { width: 1280, height: 720 },
    rect: { x: 80, y: 120, width: 320, height: 180 },
    devicePixelRatio: 2,
    source: 'region',
    timestamp: 1_000_000
  });
  assert.equal(JSON.stringify(stored).includes('private'), false);
  assert.equal(JSON.stringify(stored).includes('data:image'), false);
  assert.equal(JSON.stringify(stored).includes('OCR text'), false);
  assert.notStrictEqual(stored.rect, captureMetadata().cropRect);
});

test('last region rerun rejects malformed, out-of-bounds, tab, hostname, viewport, DPR, and TTL changes', () => {
  const metadata = normalizeLastRegionRerun(captureMetadata());
  const tab = { id: 42, hostname: 'example.test' };
  const viewport = { width: 1280, height: 720, devicePixelRatio: 2 };

  assert.equal(validateLastRegionRerun(metadata, tab, viewport, 1_000_100).ok, true);
  assert.equal(validateLastRegionRerun(null, tab, viewport, 1_000_100).ok, false);
  assert.equal(validateLastRegionRerun({ ...metadata, rect: { ...metadata.rect, width: 0 } }, tab, viewport, 1_000_100).ok, false);
  assert.equal(validateLastRegionRerun({ ...metadata, rect: { ...metadata.rect, x: 1000 } }, tab, viewport, 1_000_100).ok, false);
  assert.equal(validateLastRegionRerun(metadata, { ...tab, id: 99 }, viewport, 1_000_100).ok, false);
  assert.equal(validateLastRegionRerun(metadata, { ...tab, hostname: 'other.test' }, viewport, 1_000_100).ok, false);
  assert.equal(validateLastRegionRerun(metadata, tab, { ...viewport, width: 1279 }, 1_000_100).ok, false);
  assert.equal(validateLastRegionRerun(metadata, tab, { ...viewport, height: 719 }, 1_000_100).ok, false);
  assert.equal(validateLastRegionRerun(metadata, tab, { ...viewport, devicePixelRatio: 1 }, 1_000_100).ok, false);
  assert.equal(validateLastRegionRerun(metadata, tab, viewport, 1_000_000 + (25 * 60 * 60 * 1000)).ok, false);
  assert.deepEqual(createLastRegionRerunRequest(metadata), {
    cropRect: { x: 80, y: 120, width: 320, height: 180 },
    viewport: { width: 1280, height: 720, devicePixelRatio: 2 },
    preprocessingProfile: 'off',
    source: 'region',
    useRequestedPreprocessing: true
  });
});

test('newer rerun request wins when OCR responses arrive in reverse order', () => {
  const loading = reduceOcrSessionState({}, { type: 'loading', requestId: 8 });
  const current = reduceOcrSessionState(loading, {
    type: 'success', requestId: 8, result: successfulOcrResult({ text: '새 결과' }),
    source: 'image', metadata: captureMetadata({ requestId: 8, source: 'image' })
  });
  const stale = reduceOcrSessionState(current, {
    type: 'success', requestId: 7, result: successfulOcrResult({ text: '오래된 결과' }),
    source: 'region', metadata: captureMetadata({ requestId: 7, source: 'region' })
  });

  assert.equal(stale[LATEST_OCR_RESULT_KEY].text, '새 결과');
  assert.equal(stale[LATEST_OCR_STATUS_KEY].requestId, 8);
});

test('computeOcrEditPendingState: dismiss stays dismissed across same-text re-render', () => {
  const dismissed = computeOcrEditPendingState({
    ocrOriginalText: 'result1',
    ocrIsDirty: true,
    ocrPendingNewResultText: null,
    ocrDismissedResultText: 'result2'
  }, 'result2');

  assert.strictEqual(dismissed.showBanner, false, 'must not show banner for dismissed text');
  assert.strictEqual(dismissed.newDismissedResultText, 'result2');
  assert.strictEqual(dismissed.newPendingText, null);
  assert.strictEqual(dismissed.newIsDirty, true);
});

test('computeOcrEditPendingState: accept clears dismissed tracking and applies result', () => {
  const accepted = computeOcrEditPendingState({
    ocrOriginalText: 'result2',
    ocrIsDirty: false,
    ocrPendingNewResultText: null,
    ocrDismissedResultText: 'result2'
  }, 'result2');

  assert.strictEqual(accepted.showBanner, false);
  assert.strictEqual(accepted.newOriginalText, 'result2');
  assert.strictEqual(accepted.newEditedText, 'result2');
  assert.strictEqual(accepted.newDismissedResultText, null, 'accept clears dismissed text so fresh results can trigger banner');
  assert.strictEqual(accepted.newPendingText, null);
});

test('computeOcrEditPendingState: same result text as pending does not re-show banner', () => {
  const pending = computeOcrEditPendingState({
    ocrOriginalText: 'result1',
    ocrIsDirty: true,
    ocrPendingNewResultText: 'result2',
    ocrDismissedResultText: null
  }, 'result2');

  assert.strictEqual(pending.showBanner, false, 'must not re-show banner for already-pending text');
  assert.strictEqual(pending.newPendingText, 'result2');
  assert.strictEqual(pending.newDismissedResultText, null);
  assert.strictEqual(pending.newIsDirty, true);
});

test('computeOcrEditPendingState: genuinely new result text shows banner', () => {
  const fresh = computeOcrEditPendingState({
    ocrOriginalText: 'result1',
    ocrIsDirty: true,
    ocrPendingNewResultText: 'result2',
    ocrDismissedResultText: 'result2'
  }, 'result3');

  assert.strictEqual(fresh.showBanner, true, 'must show banner for new distinct text');
  assert.strictEqual(fresh.newPendingText, 'result3');
  assert.strictEqual(fresh.newDismissedResultText, 'result2');
});

test('computeOcrEditPendingState: non-dirty path accepts result without banner', () => {
  const clean = computeOcrEditPendingState({
    ocrOriginalText: 'result1',
    ocrIsDirty: false,
    ocrPendingNewResultText: null,
    ocrDismissedResultText: null
  }, 'result2');

  assert.strictEqual(clean.showBanner, false);
  assert.strictEqual(clean.newOriginalText, 'result2');
  assert.strictEqual(clean.newEditedText, 'result2');
  assert.strictEqual(clean.newDismissedResultText, null);
  assert.strictEqual(clean.newPendingText, null);
});

test('computeOcrEditPendingState: unchanged original OCR text on status-only re-render preserves dirty edits and never shows banner', () => {
  const decision = computeOcrEditPendingState({
    ocrOriginalText: 'result1',
    ocrIsDirty: true,
    ocrPendingNewResultText: null,
    ocrDismissedResultText: null
  }, 'result1');

  assert.strictEqual(decision.showBanner, false, 'must not show banner for unchanged OCR text');
  assert.strictEqual(decision.newIsDirty, true, 'must preserve dirty state');
  assert.strictEqual(decision.newOriginalText, 'result1', 'must preserve original text');
  assert.strictEqual(decision.newEditedText, 'result1', 'must preserve edited text');
  assert.strictEqual(decision.newPendingText, null, 'must not create pending from unchanged result');
  assert.strictEqual(decision.newDismissedResultText, null, 'must not mutate dismissed tracking');
});

test('computeOcrEditPendingState: pending result does not re-show banner on status-only re-render', () => {
  const first = computeOcrEditPendingState({
    ocrOriginalText: 'result1',
    ocrIsDirty: true,
    ocrPendingNewResultText: null,
    ocrDismissedResultText: null
  }, 'result2');

  assert.strictEqual(first.showBanner, true);
  assert.strictEqual(first.newPendingText, 'result2');

  const reRender = computeOcrEditPendingState({
    ocrOriginalText: 'result1',
    ocrIsDirty: true,
    ocrPendingNewResultText: 'result2',
    ocrDismissedResultText: null
  }, 'result2');

  assert.strictEqual(reRender.showBanner, false, 'must not re-show banner for same pending text on status re-render');
  assert.strictEqual(reRender.newPendingText, 'result2');
});

test('computeOcrEditPendingState: no original text yet returns clean accept', () => {
  const initial = computeOcrEditPendingState({
    ocrOriginalText: '',
    ocrIsDirty: false,
    ocrPendingNewResultText: null,
    ocrDismissedResultText: null
  }, 'first-result');

  assert.strictEqual(initial.showBanner, false);
  assert.strictEqual(initial.newOriginalText, 'first-result');
  assert.strictEqual(initial.newEditedText, 'first-result');
});
