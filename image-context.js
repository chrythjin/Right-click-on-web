(function imageContextInit(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.RIGHT_CLICK_ON_WEB_IMAGE_CONTEXT = api;
  }
  if (root && root.document && root.chrome?.runtime) {
    api.install(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createImageContext() {
  'use strict';

  const CACHE_TTL_MS = 3000;
  const MIN_RECT_SIZE = 2;
  const RECT_TOLERANCE_PX = 2;

  function finiteRect(value) {
    if (!value || typeof value !== 'object') return null;
    const { x, y, width, height } = value;
    if (![x, y, width, height].every(Number.isFinite) || width < MIN_RECT_SIZE || height < MIN_RECT_SIZE) {
      return null;
    }
    return { x, y, width, height };
  }

  function intersectRects(first, second) {
    const a = finiteRect(first);
    const b = finiteRect(second);
    if (!a || !b) return null;
    const left = Math.max(a.x, b.x);
    const top = Math.max(a.y, b.y);
    const right = Math.min(a.x + a.width, b.x + b.width);
    const bottom = Math.min(a.y + a.height, b.y + b.height);
    return finiteRect({ x: left, y: top, width: right - left, height: bottom - top });
  }

  function viewportRect(viewport) {
    if (!viewport || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height)) return null;
    return finiteRect({ x: 0, y: 0, width: viewport.width, height: viewport.height });
  }

  function convertToTopViewportRect(targetRect, frameChain, topViewport) {
    let rect = intersectRects(targetRect, viewportRect(frameChain?.[0]?.viewport));
    if (!rect || !Array.isArray(frameChain) || frameChain.length === 0) return null;

    for (let index = 1; index < frameChain.length; index += 1) {
      const child = frameChain[index - 1].viewport;
      const parent = frameChain[index];
      const frameRect = finiteRect(parent.frameRect);
      const parentViewport = viewportRect(parent.viewport);
      if (!child || !frameRect || !parentViewport || child.width <= 0 || child.height <= 0) return null;
      const scaleX = frameRect.width / child.width;
      const scaleY = frameRect.height / child.height;
      if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) return null;
      rect = intersectRects({
        x: frameRect.x + rect.x * scaleX,
        y: frameRect.y + rect.y * scaleY,
        width: rect.width * scaleX,
        height: rect.height * scaleY
      }, parentViewport);
      if (!rect) return null;
    }
    return intersectRects(rect, viewportRect(topViewport));
  }

  function sanitizeHostname(hostname) {
    if (typeof hostname !== 'string' || hostname.length === 0 || hostname.trim() !== hostname) return '';
    try {
      const parsed = new URL(`http://${hostname}/`);
      if (parsed.username || parsed.password || parsed.port || parsed.pathname !== '/' || parsed.search || parsed.hash) return '';
      if (hostname.includes(':') && !(hostname.startsWith('[') && hostname.endsWith(']'))) return '';
      return parsed.hostname.toLowerCase();
    } catch (_) {
      return '';
    }
  }

  function getWindowHostname(win) {
    try {
      return sanitizeHostname(win.location.hostname);
    } catch (_) {
      return '';
    }
  }

  function createCacheEntry(payload, now = Date.now()) {
    const hostname = sanitizeHostname(payload?.hostname);
    const timestamp = Number.isFinite(payload?.timestamp) ? payload.timestamp : 0;
    const manualCropRequired = payload?.manualCropRequired === true;
    const rect = manualCropRequired ? null : finiteRect(payload?.rect);
    if (!hostname || !timestamp || (!manualCropRequired && !rect)) return null;
    return Object.freeze({ hostname, timestamp, rect, manualCropRequired });
  }

  function validateCacheEntry(entry, hostname, now = Date.now()) {
    const normalized = createCacheEntry(entry, now);
    if (!normalized || sanitizeHostname(hostname) !== normalized.hostname) return null;
    if (Math.floor(normalized.timestamp) > now || now - normalized.timestamp > CACHE_TTL_MS) return null;
    return normalized;
  }

  function rectsMatch(first, second) {
    const a = finiteRect(first);
    const b = finiteRect(second);
    return Boolean(a && b && Math.abs(a.x - b.x) <= RECT_TOLERANCE_PX &&
      Math.abs(a.y - b.y) <= RECT_TOLERANCE_PX && Math.abs(a.width - b.width) <= RECT_TOLERANCE_PX &&
      Math.abs(a.height - b.height) <= RECT_TOLERANCE_PX);
  }

  function collectFrameChain(win) {
    const frames = [{ viewport: { width: win.innerWidth, height: win.innerHeight } }];
    let current = win;
    while (current !== current.top) {
      const parent = current.parent;
      const frameElement = current.frameElement;
      if (!parent || !frameElement) return null;
      const frameRect = frameElement.getBoundingClientRect();
      frames.push({
        frameRect: { x: frameRect.left, y: frameRect.top, width: frameRect.width, height: frameRect.height },
        viewport: { width: parent.innerWidth, height: parent.innerHeight }
      });
      current = parent;
    }
    return frames;
  }

  function findImageTarget(target) {
    if (!target || typeof target.closest !== 'function') return null;
    return target.closest('img');
  }

  function measureImageAtTarget(win, target) {
    const image = findImageTarget(target);
    if (!image || !image.isConnected) return { manualCropRequired: true };
    try {
      const targetWindow = image.ownerDocument?.defaultView || win;
      const imageRect = image.getBoundingClientRect();
      const frameChain = collectFrameChain(targetWindow);
      const rect = frameChain && convertToTopViewportRect(
        { x: imageRect.left, y: imageRect.top, width: imageRect.width, height: imageRect.height },
        frameChain,
        { width: targetWindow.top.innerWidth, height: targetWindow.top.innerHeight }
      );
      return rect ? { manualCropRequired: false, rect } : { manualCropRequired: true };
    } catch (_) {
      return { manualCropRequired: true };
    }
  }

  function install(win) {
    if (win.__rcowImageContextInitialized) return;
    win.__rcowImageContextInitialized = true;
    let latest = null;
    let latestTarget = null;
    let latestImage = null;

    win.document.addEventListener('contextmenu', (event) => {
      const observedImage = findImageTarget(event.target);
      const measured = measureImageAtTarget(win, event.target);
      latestTarget = event.target;
      latestImage = observedImage;
      const now = Date.now();
      const timestamp = latest && Math.floor(latest.timestamp) === now ? latest.timestamp + 0.001 : now;
      latest = {
        hostname: getWindowHostname(win),
        timestamp,
        ...measured
      };
      void win.chrome.runtime.sendMessage({ type: 'rcow:imageContextObserved', payload: latest });
    }, true);

    win.chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== 'rcow:validateImageContext') return;
      const expected = message.expected;
      if (!latest || latest.timestamp !== expected?.timestamp || !latestTarget) {
        sendResponse({ ok: false, manualCropRequired: true });
        return;
      }
      if (findImageTarget(latestTarget) !== latestImage) {
        sendResponse({ ok: false, manualCropRequired: true });
        return;
      }
      const target = latestTarget;
      const current = measureImageAtTarget(win, target);
      const valid = !current.manualCropRequired && !expected.manualCropRequired &&
        rectsMatch(current.rect, expected.rect);
      sendResponse(valid ? { ok: true, rect: current.rect, viewport: {
        width: win.top.innerWidth, height: win.top.innerHeight, devicePixelRatio: win.top.devicePixelRatio || 1
      } } : { ok: false, manualCropRequired: true });
    });
  }

  return Object.freeze({
    CACHE_TTL_MS,
    convertToTopViewportRect,
    createCacheEntry,
    finiteRect,
    intersectRects,
    measureImageAtTarget,
    rectsMatch,
    sanitizeHostname,
    getWindowHostname,
    validateCacheEntry,
    install
  });
});
