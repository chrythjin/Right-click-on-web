'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const IMAGE_CONTEXT = require(path.join(root, 'image-context.js'));

function createFrameWindow(width, height) {
  return { innerWidth: width, innerHeight: height };
}

function createImageTarget(ownerWindow, rect, onMeasure) {
  const image = {
    isConnected: true,
    ownerDocument: { defaultView: ownerWindow },
    closest(selector) {
      return selector === 'img' ? image : null;
    },
    getBoundingClientRect() {
      if (onMeasure) onMeasure();
      return { left: rect.x, top: rect.y, width: rect.width, height: rect.height };
    }
  };
  return image;
}

test('same-origin nested frame rectangles scale, accumulate, and clip to the top viewport', () => {
  const rect = IMAGE_CONTEXT.convertToTopViewportRect(
    { x: 5, y: 10, width: 100, height: 80 },
    [
      { viewport: { width: 200, height: 160 } },
      { frameRect: { x: 20, y: 30, width: 100, height: 80 }, viewport: { width: 300, height: 200 } },
      { frameRect: { x: 40, y: 50, width: 150, height: 100 }, viewport: { width: 320, height: 240 } }
    ],
    { width: 320, height: 240 }
  );
  assert.deepEqual(rect, { x: 51.25, y: 67.5, width: 25, height: 20 });
});

test('target measurement starts from the target document window and uses the top-frame viewport', () => {
  const topWindow = createFrameWindow(320, 240);
  topWindow.top = topWindow;
  topWindow.parent = topWindow;
  topWindow.devicePixelRatio = 2;

  const parentWindow = createFrameWindow(300, 200);
  parentWindow.top = topWindow;
  parentWindow.parent = topWindow;
  parentWindow.frameElement = {
    getBoundingClientRect: () => ({ left: 40, top: 50, width: 150, height: 100 })
  };

  const childWindow = createFrameWindow(200, 160);
  childWindow.top = topWindow;
  childWindow.parent = parentWindow;
  childWindow.frameElement = {
    getBoundingClientRect: () => ({ left: 20, top: 30, width: 100, height: 80 })
  };

  const target = createImageTarget(childWindow, { x: 5, y: 10, width: 100, height: 80 });
  assert.deepEqual(IMAGE_CONTEXT.measureImageAtTarget(topWindow, target), {
    manualCropRequired: false,
    rect: { x: 51.25, y: 67.5, width: 25, height: 20 }
  });
});

test('coordinate conversion rejects invalid, zero-area, and viewport-outside rectangles', () => {
  assert.equal(IMAGE_CONTEXT.convertToTopViewportRect(
    { x: 0, y: 0, width: 0, height: 20 }, [{ viewport: { width: 100, height: 100 } }], { width: 100, height: 100 }
  ), null);
  assert.equal(IMAGE_CONTEXT.convertToTopViewportRect(
    { x: 120, y: 0, width: 20, height: 20 }, [{ viewport: { width: 100, height: 100 } }], { width: 100, height: 100 }
  ), null);
  assert.equal(IMAGE_CONTEXT.convertToTopViewportRect(
    { x: 1, y: 1, width: 10, height: 10 }, [{ viewport: { width: 100, height: 100 } }, {
      frameRect: { x: 0, y: 0, width: 0, height: 20 }, viewport: { width: 100, height: 100 }
    }], { width: 100, height: 100 }), null);
});

test('cache entries retain only sanitized hostname, timestamp, rect, and fallback state', () => {
  const entry = IMAGE_CONTEXT.createCacheEntry({
    hostname: 'IMG.Example.COM', timestamp: 1000, rect: { x: 1, y: 2, width: 30, height: 40 },
    srcUrl: 'https://private.example/image.png', dataUrl: 'data:image/png;base64,secret', pageText: 'private'
  });
  assert.deepEqual(entry, {
    hostname: 'img.example.com', timestamp: 1000, rect: { x: 1, y: 2, width: 30, height: 40 }, manualCropRequired: false
  });
  assert.equal(JSON.stringify(entry).includes('private.example'), false);
  assert.equal(JSON.stringify(entry).includes('data:image'), false);
});

test('opaque window hostname access is sanitized to an empty hostname without throwing', () => {
  assert.equal(IMAGE_CONTEXT.getWindowHostname({
    get location() { throw new Error('SecurityError'); }
  }), '');
});

test('hostname sanitization preserves canonical IPv4, IPv6, and IDN browser hostnames', () => {
  assert.equal(IMAGE_CONTEXT.sanitizeHostname('192.168.001.001'), '192.168.1.1');
  assert.equal(IMAGE_CONTEXT.sanitizeHostname('[2001:0DB8::1]'), '[2001:db8::1]');
  assert.equal(IMAGE_CONTEXT.sanitizeHostname('Bücher.Example'), 'xn--bcher-kva.example');
  assert.equal(IMAGE_CONTEXT.sanitizeHostname(''), '');
  assert.equal(IMAGE_CONTEXT.sanitizeHostname('https://example.com/private'), '');
});

test('cache validation rejects stale timestamps, hostname mismatch, and accepts fallback entries', () => {
  const automatic = IMAGE_CONTEXT.createCacheEntry({
    hostname: 'img.example', timestamp: 1000, rect: { x: 1, y: 2, width: 30, height: 40 }
  });
  assert.equal(IMAGE_CONTEXT.validateCacheEntry(automatic, 'img.example', 1000 + IMAGE_CONTEXT.CACHE_TTL_MS + 1), null);
  assert.equal(IMAGE_CONTEXT.validateCacheEntry(automatic, 'other.example', 1001), null);
  const fallback = IMAGE_CONTEXT.createCacheEntry({ hostname: 'img.example', timestamp: 1000, manualCropRequired: true });
  assert.deepEqual(IMAGE_CONTEXT.validateCacheEntry(fallback, 'img.example', 1001), fallback);
});

test('small scroll mismatch tolerance is bounded and stale geometry is rejected', () => {
  assert.equal(IMAGE_CONTEXT.rectsMatch(
    { x: 10, y: 20, width: 50, height: 60 }, { x: 11.5, y: 18.5, width: 51, height: 59 }
  ), true);
  assert.equal(IMAGE_CONTEXT.rectsMatch(
    { x: 10, y: 20, width: 50, height: 60 }, { x: 13, y: 20, width: 50, height: 60 }
  ), false);
});

test('validation rejects a replaced target before measuring the replacement image', () => {
  const contextmenuListeners = [];
  const messageListeners = [];
  const observed = [];
  const win = createFrameWindow(800, 600);
  win.top = win;
  win.parent = win;
  win.devicePixelRatio = 2;
  win.location = { hostname: 'images.example' };
  win.document = {
    addEventListener(type, listener) {
      if (type === 'contextmenu') contextmenuListeners.push(listener);
    }
  };
  win.chrome = { runtime: {
    sendMessage(message) {
      observed.push(message.payload);
      return Promise.resolve();
    },
    onMessage: {
      addListener(listener) {
        messageListeners.push(listener);
      }
    }
  } };

  let replacementMeasurements = 0;
  let currentImage;
  const firstImage = createImageTarget(win, { x: 10, y: 20, width: 100, height: 80 });
  const replacementImage = createImageTarget(
    win, { x: 10, y: 20, width: 100, height: 80 }, () => { replacementMeasurements += 1; }
  );
  const target = {
    closest(selector) {
      return selector === 'img' ? currentImage : null;
    }
  };
  const originalNow = Date.now;
  Date.now = () => 1000;
  try {
    IMAGE_CONTEXT.install(win);
    currentImage = firstImage;
    contextmenuListeners[0]({ target });
    currentImage = replacementImage;
  } finally {
    Date.now = originalNow;
  }

  assert.equal(observed[0].timestamp, 1000);
  assert.equal(observed.length, 1);
  let response;
  messageListeners[0]({ type: 'rcow:validateImageContext', expected: observed[0] }, null, (value) => {
    response = value;
  });
  assert.deepEqual(response, { ok: false, manualCropRequired: true });
  assert.equal(replacementMeasurements, 0);
});

test('validation remeasures the same observed image and returns its current rectangle', () => {
  const contextmenuListeners = [];
  const messageListeners = [];
  const observed = [];
  const win = createFrameWindow(800, 600);
  win.top = win;
  win.parent = win;
  win.devicePixelRatio = 2;
  win.location = { hostname: 'images.example' };
  win.document = {
    addEventListener(type, listener) {
      if (type === 'contextmenu') contextmenuListeners.push(listener);
    }
  };
  win.chrome = { runtime: {
    sendMessage(message) {
      observed.push(message.payload);
      return Promise.resolve();
    },
    onMessage: {
      addListener(listener) {
        messageListeners.push(listener);
      }
    }
  } };

  let measurements = 0;
  const image = createImageTarget(win, { x: 10, y: 20, width: 100, height: 80 }, () => {
    measurements += 1;
  });
  const target = { closest: (selector) => selector === 'img' ? image : null };
  IMAGE_CONTEXT.install(win);
  contextmenuListeners[0]({ target });

  let response;
  messageListeners[0]({ type: 'rcow:validateImageContext', expected: observed[0] }, null, (value) => {
    response = value;
  });

  assert.equal(response.ok, true);
  assert.deepEqual(response.rect, observed[0].rect);
  assert.equal(measurements, 2);
});

test('manifest installs the image observer before the isolated unblocker while keeping MAIN first', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.content_scripts[0].js[0], 'content-main.js');
  assert.equal(manifest.content_scripts[0].world, 'MAIN');
  const imageScriptIndex = manifest.content_scripts.findIndex((entry) => entry.js?.includes('image-context.js'));
  const unblockerScriptIndex = manifest.content_scripts.findIndex((entry) => entry.js?.includes('content.js'));
  assert.ok(imageScriptIndex > 0);
  assert.ok(imageScriptIndex < unblockerScriptIndex);
  const imageScript = manifest.content_scripts[imageScriptIndex];
  assert.deepEqual(imageScript, {
    matches: ['<all_urls>'], js: ['image-context.js'], run_at: 'document_start', all_frames: true,
    match_about_blank: true, match_origin_as_fallback: true
  });
  const unblockerScript = manifest.content_scripts[unblockerScriptIndex];
  assert.deepEqual({
    run_at: unblockerScript.run_at,
    all_frames: unblockerScript.all_frames,
    match_about_blank: unblockerScript.match_about_blank,
    match_origin_as_fallback: unblockerScript.match_origin_as_fallback
  }, {
    run_at: 'document_start', all_frames: true, match_about_blank: true, match_origin_as_fallback: true
  });
  assert.deepEqual(unblockerScript.js, ['shared.js', 'content.js']);
  const cropScript = manifest.content_scripts.find((entry) => entry.js?.includes('crop-overlay.js'));
  assert.equal(cropScript.js.at(-1), 'crop-overlay.js');
  assert.equal(manifest.background.scripts.includes('image-context.js'), true);
  assert.ok(manifest.background.scripts.indexOf('image-context.js') < manifest.background.scripts.indexOf('background.js'));
});

test('background source creates an image-only menu and never stores image URLs', () => {
  const source = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
  assert.match(source, /contexts:\s*\['image'\]/);
  assert.match(source, /imageContextCache\.set/);
  assert.match(source, /hostname:\s*SHARED\.getHostname\(sender\?\.tab\?\.url\)/);
  assert.equal(/imageContextCache[^\n]*srcUrl/.test(source), false);
});

test('image and manual region OCR producers use the canonical shared source contract', () => {
  const background = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
  const overlay = fs.readFileSync(path.join(root, 'crop-overlay.js'), 'utf8');

  assert.match(background, /source:\s*'image'/);
  assert.match(background, /source:\s*OCR_SESSION\.normalizeOcrSource\(message\.source\)/);
  assert.match(background, /captureAndOcr\(tab,\s*\{[\s\S]*source:\s*OCR_SESSION\.normalizeOcrSource\(message\.source\)/);
  assert.equal((overlay.match(/type:\s*'rcow:captureAndOcr'/g) || []).length, 2);
  assert.equal((overlay.match(/source:\s*'region'/g) || []).length, 2);
  assert.match(background, /captureVisibleTab\(captureTab\.windowId/);
  assert.equal(/srcUrl/.test(overlay), false);
});
