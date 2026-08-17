const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
  assertSafePixelDimensions,
  calculateOtsuThreshold,
  calculateCropBounds,
  chooseRecognitionResult,
  createPreprocessingPlan,
  createOcrSuccessResponse,
  getUpscaleFactor,
  isDarkBackground,
  hasVisiblePixels,
  recognizeWithCandidates,
  scalePixelLength,
  shouldRetryRecognition,
  toGrayscalePixels,
  transformPixels
} = require(path.join(__dirname, '..', '..', 'ocr-image-utils.js'));

test('pixel scaling applies DPR and product rounding rules', () => {
  assert.equal(scalePixelLength(10.25, 2), 21);
  assert.equal(scalePixelLength(7, 1.5), 11);
});

test('crop bounds clamp negative origins and right/bottom overflow', () => {
  assert.deepEqual(
    calculateCropBounds({ x: -4, y: -3, width: 60, height: 50 }, 2, 100, 80),
    { sx: 0, sy: 0, sw: 100, sh: 80 }
  );
  assert.deepEqual(
    calculateCropBounds({ x: 45, y: 30, width: 20, height: 20 }, 2, 100, 80),
    { sx: 90, sy: 60, sw: 10, sh: 20 }
  );
});

test('crop bounds preserve the zero-area signal outside the capture', () => {
  assert.deepEqual(
    calculateCropBounds({ x: 60, y: 50, width: 10, height: 10 }, 2, 100, 80),
    { sx: 100, sy: 80, sw: 0, sh: 0 }
  );
});

test('crop bounds normalize negative dimensions to a zero-area signal', () => {
  assert.deepEqual(
    calculateCropBounds({ x: 10, y: 10, width: -5, height: -8 }, 2, 100, 80),
    { sx: 20, sy: 20, sw: 0, sh: 0 }
  );
});

test('OCR confidence excludes blank words and retains legacy text', () => {
  const response = createOcrSuccessResponse({
    text: '  Korean English  ',
    words: [
      { text: 'Korean', confidence: 80 },
      { text: ' ', confidence: 1 },
      { text: 'English', confidence: 61 },
      { text: '', confidence: 99 }
    ]
  }, { width: 640, height: 220 }, 1240.4);

  assert.equal(response.text, 'Korean English');
  assert.deepEqual(response.confidence, {
    average: 71,
    lowCount: 1,
    threshold: 70
  });
  assert.deepEqual(response.preprocessing, {
    profile: 'off',
    upscale: 1,
    grayscale: false,
    invert: false,
    threshold: null
  });
  assert.equal(response.timingMs, 1240);
  assert.deepEqual(response.crop, { width: 640, height: 220 });
});

test('OCR confidence clamps and rounds valid words without NaN for missing words', () => {
  const clamped = createOcrSuccessResponse({
    text: 'value',
    words: [
      { text: 'high', confidence: 110 },
      { text: 'low', confidence: -10 },
      { text: 'fraction', confidence: 70.5 }
    ]
  }, { width: 20.4, height: -3 }, -1);
  const missingWords = createOcrSuccessResponse({ text: '' }, {}, Number.NaN);

  assert.deepEqual(clamped.confidence, {
    average: 57,
    lowCount: 1,
    threshold: 70
  });
  assert.equal(clamped.timingMs, 0);
  assert.deepEqual(clamped.crop, { width: 20, height: 0 });
  assert.deepEqual(missingWords.confidence, {
    average: 0,
    lowCount: 0,
    threshold: 70
  });
  assert.equal(missingWords.text, '');
});

test('pixel preprocessing uses product grayscale, Otsu, and invert transforms', () => {
  const pixels = new Uint8ClampedArray([
    0, 0, 0, 255,
    255, 255, 255, 255,
    255, 0, 0, 255
  ]);
  const grayscale = toGrayscalePixels(pixels);

  assert.deepEqual([...grayscale], [0, 255, 54]);
  assert.equal(calculateOtsuThreshold(new Uint8ClampedArray([0, 0, 255, 255])), 0);
  assert.equal(isDarkBackground(new Uint8ClampedArray([0, 20, 60])), true);
  assert.equal(isDarkBackground(new Uint8ClampedArray([180, 220])), false);
  assert.deepEqual([...transformPixels(pixels, {
    grayscale: true,
    invert: true,
    threshold: 100
  })], [255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255]);
});

test('no-op pixel transforms preserve the original pixel buffer', () => {
  const pixels = new Uint8ClampedArray([10, 20, 30, 255]);
  assert.strictEqual(transformPixels(pixels), pixels);
  assert.strictEqual(transformPixels(pixels, {}), pixels);
});

test('malformed or missing RGBA buffers produce empty grayscale output', () => {
  assert.deepEqual([...toGrayscalePixels(new Uint8ClampedArray([10, 20, 30]))], []);
  assert.deepEqual([...toGrayscalePixels()], []);
});

test('preprocessing rejects unsafe dimensions and only upscales bounded small inputs', () => {
  assert.equal(getUpscaleFactor(900, 500), 2);
  assert.equal(getUpscaleFactor(901, 500), 1);
  assert.equal(getUpscaleFactor(1600, 1600), 1);
  assert.throws(() => assertSafePixelDimensions(0, 10), /안전 한도/);
  assert.throws(() => assertSafePixelDimensions(5000, 4000), /안전 한도/);
});

test('oversized preprocessing inputs return the baseline plan without asserting crop dimensions', () => {
  const width = 4001;
  const height = 4001;
  const largeBuffer = new Uint8ClampedArray(width * height * 4);
  assert.deepEqual(createPreprocessingPlan(width, height, largeBuffer), {
    initial: { profile: 'off', upscale: 1, grayscale: false, invert: false, threshold: null },
    alternate: null
  });
});

test('candidate selection is deterministic and keeps processing bounded', () => {
  const darkPixels = new Uint8ClampedArray(4 * 4 * 4).fill(255);
  for (let offset = 0; offset < darkPixels.length; offset += 4) {
    darkPixels[offset] = 20;
    darkPixels[offset + 1] = 20;
    darkPixels[offset + 2] = 20;
  }
  const darkPlan = createPreprocessingPlan(4, 4, darkPixels);
  const highContrastPixels = new Uint8ClampedArray(1000 * 1000 * 4).fill(255);
  for (let offset = 0; offset < highContrastPixels.length; offset += 16) {
    highContrastPixels[offset] = 0;
    highContrastPixels[offset + 1] = 0;
    highContrastPixels[offset + 2] = 0;
  }
  const originalPlan = createPreprocessingPlan(1000, 1000, highContrastPixels);

  assert.deepEqual(darkPlan.initial, {
    profile: 'invert', upscale: 2, grayscale: true, invert: true, threshold: 0
  });
  assert.deepEqual(darkPlan.alternate, {
    profile: 'off', upscale: 1, grayscale: false, invert: false, threshold: null
  });
  assert.deepEqual(originalPlan.initial, {
    profile: 'off', upscale: 1, grayscale: false, invert: false, threshold: null
  });
  assert.deepEqual(originalPlan.alternate, {
    profile: 'auto', upscale: 1, grayscale: true, invert: false, threshold: 0
  });
});

test('retry policy has a single confidence threshold and selects at most one alternate result', async () => {
  assert.equal(shouldRetryRecognition({ average: 69 }), true);
  assert.equal(shouldRetryRecognition({ average: 70 }), false);
  assert.equal(shouldRetryRecognition({ average: Number.NaN }), false);

  const first = { words: [{ text: 'first', confidence: 55 }] };
  const second = { words: [{ text: 'second', confidence: 72 }] };
  assert.deepEqual(chooseRecognitionResult(first, second), { data: second, attempt: 2 });
  assert.deepEqual(chooseRecognitionResult(second, first), { data: second, attempt: 1 });
  assert.deepEqual(chooseRecognitionResult(first, null), { data: first, attempt: 1 });

  const calls = [];
  const recognition = await recognizeWithCandidates(async (candidate) => {
    calls.push(candidate.profile);
    return calls.length === 1 ? first : second;
  }, { profile: 'off' }, { profile: 'auto' });
  assert.deepEqual(calls, ['off', 'auto']);
  assert.equal(recognition.attempt, 2);
  assert.equal(recognition.preprocessing.profile, 'auto');

  const noRetryCalls = [];
  await recognizeWithCandidates(async (candidate) => {
    noRetryCalls.push(candidate.profile);
    return { words: [{ text: 'enough', confidence: 70 }] };
  }, { profile: 'off' }, { profile: 'auto' });
  assert.deepEqual(noRetryCalls, ['off']);
});

test('missing first OCR result does not run the alternate candidate', async () => {
  const calls = [];
  const initial = { profile: 'off' };
  const alternate = { profile: 'auto' };
  const recognition = await recognizeWithCandidates(async (candidate) => {
    calls.push(candidate.profile);
    return null;
  }, initial, alternate);

  assert.deepEqual(calls, ['off']);
  assert.deepEqual(recognition, {
    data: null,
    attempt: 1,
    preprocessing: initial
  });
});

test('visible-pixel check distinguishes transparent empty images without retaining pixels', () => {
  assert.equal(hasVisiblePixels(new Uint8ClampedArray(16)), false);
  assert.equal(hasVisiblePixels(new Uint8ClampedArray([0, 0, 0, 1])), true);
});
