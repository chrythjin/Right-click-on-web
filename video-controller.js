// Right-click on Web — Video Speed Controller (ISOLATED world)
//
// Responsibilities:
//   - Detect and track all HTML5 <video> and <audio> elements across Document and Shadow Roots
//   - Render on-screen display (OSD) overlay badges above active video players
//   - Handle keyboard shortcuts for playback speed adjustment, rewind/forward, and OSD toggle
//   - Synchronize speed state with chrome.storage (per-domain speed memory)
//   - Re-apply the selected speed after page-originated rate changes while enabled

(function videoControllerInit() {
  'use strict';

  if (window.__rightClickOnWebVideoControllerInitialized) {
    return;
  }
  window.__rightClickOnWebVideoControllerInitialized = true;

  const SHARED = globalThis.RIGHT_CLICK_ON_WEB_SHARED;
  if (!SHARED) {
    return;
  }

  const hostname = SHARED.getHostname(window.location.href);
  let currentSettings = { ...SHARED.DEFAULT_VIDEO_SPEED_SETTINGS };
  let currentSpeed = 1.0;
  let preferredSpeedToggleState = false;
  let effectiveEnabled = globalThis.__rightClickOnWebEffectiveEnabled === true;
  let persistTimer = null;

  const trackedMediaSet = new Set();
  const mediaOsdMap = new Map();
  const mediaControllerMap = new Map();
  const mediaRateIntentMap = new Map();
  let mediaPollTimer = null;
  let runtimeActive = false;
  let mediaObserver = null;
  const USER_RATE_COMMIT_DELAY_MS = 120;
  const TRANSIENT_RATE_HOLD_MS = 600;
  const USER_RATE_INTENT_TIMEOUT_MS = 10000;
  const SITE_RATE_RESTORE_DELAY_MS = 80;
  const OSD_LIFETIME_MS = 1200;

  // ---------------------------------------------------------------------------
  // 1. Settings loader & storage synchronization
  // ---------------------------------------------------------------------------

  async function loadVideoSettings() {
    try {
      const resolved = await SHARED.resolveSettings({
        videoSpeedSettings: SHARED.DEFAULT_VIDEO_SPEED_SETTINGS
      });
      currentSettings = SHARED.normalizeVideoSpeedSettings(resolved.videoSpeedSettings);
      currentSpeed = SHARED.resolveVideoSpeed(hostname, currentSettings);
      if (effectiveEnabled) applySpeedToAllMedia(currentSpeed, false);
    } catch (_) {
      currentSettings = { ...SHARED.DEFAULT_VIDEO_SPEED_SETTINGS };
      currentSpeed = 1.0;
    }
  }

  function saveCurrentSpeed(speed) {
    if (!hostname) return;
    const nextSiteSpeeds = { ...(currentSettings.siteSpeeds || {}) };
    nextSiteSpeeds[hostname] = SHARED.clampVideoSpeed(speed);
    const updatedSettings = {
      ...currentSettings,
      enabled: true,
      siteSpeeds: nextSiteSpeeds
    };
    currentSettings = updatedSettings;

    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'rcow:updateVideoSpeedSettings',
          payload: { hostname, speed: SHARED.clampVideoSpeed(speed) }
        }).then((response) => {
          if (response?.ok) {
            currentSettings = SHARED.normalizeVideoSpeedSettings(response.settings);
          }
        }).catch(() => {});
      }
    }, 300);
  }

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if ((areaName === 'local' || areaName === 'sync') && changes.videoSpeedSettings) {
        const nextRaw = changes.videoSpeedSettings.newValue;
        currentSettings = SHARED.normalizeVideoSpeedSettings(nextRaw);
        currentSpeed = SHARED.resolveVideoSpeed(hostname, currentSettings);
        if (effectiveEnabled && currentSettings.enabled) {
          activateController();
          applySpeedToAllMedia(currentSpeed, false);
        } else {
          deactivateController();
        }
        updateAllOsd();
      }
    });
  }

  function setControllerEnabled(nextEnabled) {
    effectiveEnabled = Boolean(nextEnabled);
    if (effectiveEnabled && currentSettings.enabled) {
      activateController();
      applySpeedToAllMedia(currentSpeed, false);
    } else {
      deactivateController();
    }
  }

  globalThis.__rightClickOnWebSetVideoControllerEnabled = setControllerEnabled;

  // ---------------------------------------------------------------------------
  // 2. Media element discovery & Shadow DOM traversal
  // ---------------------------------------------------------------------------

  function isEditableElement(el) {
    if (!el || !(el instanceof Element)) return false;
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (el.isContentEditable) return true;
    return Boolean(el.closest && el.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));
  }

  function collectMediaElements(rootNode, list = []) {
    if (!rootNode) return list;
    try {
      const elements = rootNode.querySelectorAll ? rootNode.querySelectorAll('video, audio') : [];
      for (const el of elements) {
        list.push(el);
      }
      // Traverse open shadow roots
      const allElements = rootNode.querySelectorAll ? rootNode.querySelectorAll('*') : [];
      for (const el of allElements) {
        if (el.shadowRoot) {
          collectMediaElements(el.shadowRoot, list);
        }
      }
    } catch (_) {}
    return list;
  }

  function scanMediaElements() {
    if (!effectiveEnabled || !currentSettings.enabled) return;
    for (const media of trackedMediaSet) {
      if (!media.isConnected) {
        untrackMediaElement(media);
      }
    }
    const found = collectMediaElements(document);
    for (const media of found) {
      if (!trackedMediaSet.has(media)) {
        trackMediaElement(media);
      }
    }
  }

  function trackMediaElement(media) {
    if (!media || !(media instanceof HTMLMediaElement)) return;
    trackedMediaSet.add(media);
    const controller = new AbortController();
    mediaControllerMap.set(media, controller);

    mediaRateIntentMap.set(media, {
      interactionStartedAt: 0,
      interactionUntil: 0,
      pointerId: null,
      key: '',
      pendingRate: null,
      finalizeTimer: null,
      intentTimeout: null,
      restoreTimer: null
    });

    applySpeedToElement(media, currentSpeed, false);

    const clearUserRateIntent = (intent) => {
      if (intent.intentTimeout !== null) clearTimeout(intent.intentTimeout);
      intent.intentTimeout = null;
      intent.interactionStartedAt = 0;
      intent.interactionUntil = 0;
      intent.pointerId = null;
      intent.key = '';
      intent.pendingRate = null;
    };
    const finalizeUserRateIntent = () => {
      const intent = mediaRateIntentMap.get(media);
      if (!intent) return;
      const now = performance.now();
      const heldFor = now - intent.interactionStartedAt;
      intent.interactionUntil = now + USER_RATE_COMMIT_DELAY_MS;
      if (intent.intentTimeout !== null) clearTimeout(intent.intentTimeout);
      intent.intentTimeout = null;
      intent.finalizeTimer = setTimeout(() => {
        intent.finalizeTimer = null;
        if (intent.pendingRate !== null) {
          if (heldFor >= TRANSIENT_RATE_HOLD_MS) {
            applySpeedToElement(media, currentSpeed, false);
          } else {
            updateCurrentSpeed(intent.pendingRate, true);
            showOsdForVideo(media);
          }
        }
        clearUserRateIntent(intent);
      }, USER_RATE_COMMIT_DELAY_MS);
    };
    const beginUserRateIntent = (kind, value) => {
      const intent = mediaRateIntentMap.get(media);
      if (!intent || intent.pointerId !== null || intent.key) return;
      if (intent.finalizeTimer !== null) clearTimeout(intent.finalizeTimer);
      if (intent.restoreTimer !== null) clearTimeout(intent.restoreTimer);
      intent.finalizeTimer = null;
      intent.restoreTimer = null;
      intent.interactionStartedAt = performance.now();
      intent.interactionUntil = intent.interactionStartedAt + USER_RATE_INTENT_TIMEOUT_MS;
      intent.pendingRate = null;
      if (kind === 'pointer') intent.pointerId = value;
      else intent.key = value;
      intent.intentTimeout = setTimeout(finalizeUserRateIntent, USER_RATE_INTENT_TIMEOUT_MS);
    };
    const finishPointerIntent = (event) => {
      if (!event.isTrusted) return;
      const intent = mediaRateIntentMap.get(media);
      if (intent?.pointerId !== event.pointerId) return;
      finalizeUserRateIntent();
    };
    const finishKeyIntent = (event) => {
      if (!event.isTrusted) return;
      const intent = mediaRateIntentMap.get(media);
      if (!intent || !intent.key || intent.key !== (event.code || event.key)) return;
      finalizeUserRateIntent();
    };
    const cancelUserRateIntent = () => {
      const intent = mediaRateIntentMap.get(media);
      if (!intent || (intent.pointerId === null && !intent.key)) return;
      if (intent.pendingRate !== null) applySpeedToElement(media, currentSpeed, false);
      clearUserRateIntent(intent);
    };
    media.addEventListener('pointerdown', (event) => {
      if (event.isTrusted) beginUserRateIntent('pointer', event.pointerId);
    }, { capture: true, passive: true, signal: controller.signal });
    window.addEventListener('pointerup', finishPointerIntent, { capture: true, passive: true, signal: controller.signal });
    window.addEventListener('pointercancel', finishPointerIntent, { capture: true, passive: true, signal: controller.signal });
    media.addEventListener('lostpointercapture', finishPointerIntent, { capture: true, passive: true, signal: controller.signal });
    media.addEventListener('keydown', (event) => {
      if (event.isTrusted && !event.repeat && !event.defaultPrevented) {
        beginUserRateIntent('key', event.code || event.key);
      }
    }, { capture: true, passive: true, signal: controller.signal });
    window.addEventListener('keyup', finishKeyIntent, { capture: true, passive: true, signal: controller.signal });
    window.addEventListener('blur', cancelUserRateIntent, { passive: true, signal: controller.signal });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') cancelUserRateIntent();
    }, { passive: true, signal: controller.signal });

    media.addEventListener('play', () => {
      if (!effectiveEnabled || !currentSettings.enabled) return;
      applySpeedToElement(media, currentSpeed, false);
    }, { passive: true, signal: controller.signal });

    media.addEventListener('ratechange', () => {
      if (!effectiveEnabled || !currentSettings.enabled) return;
      const intent = mediaRateIntentMap.get(media);
      const now = performance.now();
      const classification = SHARED.classifyVideoRateChange(
        currentSpeed,
        media.playbackRate,
        Boolean(intent && now <= intent.interactionUntil)
      );
      if (!currentSettings.speedLock || classification === 'matched') return;
      if (classification === 'user') {
        intent.pendingRate = SHARED.clampVideoSpeed(media.playbackRate);
        return;
      }
      if (intent?.restoreTimer !== null) clearTimeout(intent.restoreTimer);
      if (intent) {
        intent.restoreTimer = setTimeout(() => {
          intent.restoreTimer = null;
          if (performance.now() > intent.interactionUntil &&
              effectiveEnabled && currentSettings.enabled &&
              Math.abs(media.playbackRate - currentSpeed) > 0.01) {
            applySpeedToElement(media, currentSpeed, false);
          }
        }, SITE_RATE_RESTORE_DELAY_MS);
      }
    }, { passive: true, signal: controller.signal });

    media.addEventListener('emptied', () => {
      setTimeout(() => {
        if (effectiveEnabled && currentSettings.enabled) applySpeedToElement(media, currentSpeed, false);
      }, 100);
    }, { passive: true, signal: controller.signal });
  }

  function untrackMediaElement(media) {
    const osd = mediaOsdMap.get(media);
    if (osd) {
      osd.remove();
      mediaOsdMap.delete(media);
    }
    const controller = mediaControllerMap.get(media);
    if (controller) {
      controller.abort();
      mediaControllerMap.delete(media);
    }
    const intent = mediaRateIntentMap.get(media);
    if (intent?.finalizeTimer !== null) clearTimeout(intent.finalizeTimer);
    if (intent?.intentTimeout !== null) clearTimeout(intent.intentTimeout);
    if (intent?.restoreTimer !== null) clearTimeout(intent.restoreTimer);
    if (intent?.osdTimer !== null) clearTimeout(intent.osdTimer);
    mediaRateIntentMap.delete(media);
    trackedMediaSet.delete(media);
  }

  // ---------------------------------------------------------------------------
  // 3. Playback speed enforcement
  // ---------------------------------------------------------------------------

  function applySpeedToElement(media, speed, showOsd = false) {
    if (!media || !(media instanceof HTMLMediaElement)) return;
    const clamped = SHARED.clampVideoSpeed(speed);
    try {
      media.playbackRate = clamped;
      if (typeof media.defaultPlaybackRate === 'number') {
        media.defaultPlaybackRate = clamped;
      }
    } catch (_) {}
    if (showOsd) showOsdForVideo(media);
  }

  function updateCurrentSpeed(speed, save) {
    currentSpeed = SHARED.clampVideoSpeed(speed);
    if (save) {
      saveCurrentSpeed(currentSpeed);
    }
  }

  function applySpeedToAllMedia(speed, save = true) {
    if (!effectiveEnabled || !currentSettings.enabled) return;
    updateCurrentSpeed(speed, save);
    for (const media of trackedMediaSet) {
      if (document.contains(media) || (media.getRootNode && media.getRootNode() instanceof ShadowRoot)) {
        applySpeedToElement(media, currentSpeed, save);
      } else {
        untrackMediaElement(media);
      }
    }
  }

  function applySpeedToMedia(mediaList, speed, save = true) {
    if (!effectiveEnabled || !currentSettings.enabled || mediaList.length === 0) return;
    updateCurrentSpeed(speed, save);
    for (const media of mediaList) {
      applySpeedToElement(media, currentSpeed, save);
    }
  }

  function adjustSpeed(delta, save = true, mediaList = Array.from(trackedMediaSet)) {
    applySpeedToMedia(mediaList, currentSpeed + delta, save);
  }

  function seekMedia(mediaList, seconds) {
    for (const media of mediaList) {
      try {
        if (!media.paused && Number.isFinite(media.currentTime)) {
          media.currentTime = Math.max(0, Math.min(media.duration || Infinity, media.currentTime + seconds));
        }
      } catch (_) {}
    }
  }

  // ---------------------------------------------------------------------------
  // 4. OSD (On-Screen Display) Overlay UI
  // ---------------------------------------------------------------------------

  function ensureOsdForVideo(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    let osd = mediaOsdMap.get(video);
    if (osd && osd.isConnected) return osd;

    osd = document.createElement('div');
    osd.className = 'rcow-video-osd';
    osd.setAttribute('role', 'status');
    osd.setAttribute('aria-live', 'polite');
    osd.textContent = SHARED.formatVideoSpeed(currentSpeed);
    (document.body || document.documentElement).appendChild(osd);

    mediaOsdMap.set(video, osd);
    positionOsd(video, osd);
    return osd;
  }

  function positionOsd(video, osd) {
    if (!video || !osd || !document.contains(video)) return;
    const rect = video.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || rect.bottom < 0 || rect.top > window.innerHeight) {
      osd.style.display = 'none';
      return;
    }
    osd.style.left = `${Math.min(window.innerWidth - 72, Math.max(8, rect.left + 12))}px`;
    osd.style.top = `${Math.min(window.innerHeight - 40, Math.max(8, rect.top + 12))}px`;
  }

  function updateOsdForVideo(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    const osd = mediaOsdMap.get(video);
    if (!osd) return;
    osd.textContent = SHARED.formatVideoSpeed(currentSpeed);
    positionOsd(video, osd);
  }

  function showOsdForVideo(video) {
    if (!currentSettings.showOsd || !(video instanceof HTMLVideoElement)) return;
    const osd = ensureOsdForVideo(video);
    if (!osd) return;
    updateOsdForVideo(video);
    osd.classList.remove('rcow-video-osd-visible');
    void osd.offsetWidth;
    osd.classList.add('rcow-video-osd-visible');
    const intent = mediaRateIntentMap.get(video);
    if (intent?.osdTimer) clearTimeout(intent.osdTimer);
    if (intent) {
      intent.osdTimer = setTimeout(() => {
        intent.osdTimer = null;
        osd.remove();
        if (mediaOsdMap.get(video) === osd) {
          mediaOsdMap.delete(video);
        }
      }, OSD_LIFETIME_MS);
    }
  }

  function updateAllOsd() {
    for (const media of trackedMediaSet) {
      if (media instanceof HTMLVideoElement) {
        const osd = mediaOsdMap.get(media);
        if (!currentSettings.showOsd && osd) {
          osd.remove();
          mediaOsdMap.delete(media);
        } else if (osd) {
          updateOsdForVideo(media);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Keyboard shortcuts handler
  // ---------------------------------------------------------------------------

  function handleKeydown(event) {
    if (!effectiveEnabled || !currentSettings.enabled) return;
    const eventPath = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
    if (eventPath.some(isEditableElement)) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;

    const targetElement = event.target instanceof Element
      ? event.target.closest('video, audio')
      : null;
    let focusedMedia = targetElement instanceof HTMLMediaElement ? targetElement : null;
    const playingMedia = Array.from(trackedMediaSet).filter((media) => (
      !media.paused && !media.ended && document.contains(media)
    ));
    const activeMedia = focusedMedia ? [focusedMedia] : playingMedia;
    if (activeMedia.length === 0) return;

    const key = event.key.toLowerCase();
    const shortcuts = currentSettings.shortcuts || {};

    // 1) Decrease speed: '[' or configured
    if (key === (shortcuts.decrease || '[').toLowerCase()) {
      event.preventDefault();
      adjustSpeed(-currentSettings.speedStep, true, activeMedia);
      return;
    }

    // 2) Increase speed: ']' or configured
    if (key === (shortcuts.increase || ']').toLowerCase()) {
      event.preventDefault();
      adjustSpeed(currentSettings.speedStep, true, activeMedia);
      return;
    }

    // 3) Big Decrease speed: '{'
    if (key === (shortcuts.bigDecrease || '{').toLowerCase()) {
      event.preventDefault();
      adjustSpeed(-currentSettings.bigSpeedStep, true, activeMedia);
      return;
    }

    // 4) Big Increase speed: '}'
    if (key === (shortcuts.bigIncrease || '}').toLowerCase()) {
      event.preventDefault();
      adjustSpeed(currentSettings.bigSpeedStep, true, activeMedia);
      return;
    }

    // 5) Reset speed: 'r'
    if (key === (shortcuts.reset || 'r').toLowerCase()) {
      event.preventDefault();
      applySpeedToMedia(activeMedia, 1.0);
      return;
    }

    // 6) Preferred speed toggle: 'g'
    if (key === (shortcuts.preferred || 'g').toLowerCase()) {
      event.preventDefault();
      const targetPref = shortcuts.preferredSpeed || 2.0;
      if (!preferredSpeedToggleState) {
        preferredSpeedToggleState = true;
        applySpeedToMedia(activeMedia, targetPref);
      } else {
        preferredSpeedToggleState = false;
        applySpeedToMedia(activeMedia, 1.0);
      }
      return;
    }

    // 7) Rewind: 'z' (10s)
    if (key === (shortcuts.rewind || 'z').toLowerCase()) {
      event.preventDefault();
      seekMedia(activeMedia, -(currentSettings.rewindTime || 10));
      return;
    }

    // 8) Forward: 'x' (10s)
    if (key === (shortcuts.forward || 'x').toLowerCase()) {
      event.preventDefault();
      seekMedia(activeMedia, currentSettings.forwardTime || 10);
      return;
    }

    // 9) Toggle OSD visibility: 'v'
    if (key === (shortcuts.toggleOsd || 'v').toLowerCase()) {
      event.preventDefault();
      currentSettings.showOsd = !currentSettings.showOsd;
      updateAllOsd();
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Lifecycle & periodic observer
  // ---------------------------------------------------------------------------

  function activateController() {
    if (runtimeActive) return;
    runtimeActive = true;
    window.addEventListener('keydown', handleKeydown, { capture: true, passive: false });
    document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true });
    mediaObserver = new MutationObserver(scanMediaElements);
    mediaObserver.observe(document.documentElement || document, {
      childList: true,
      subtree: true
    });
    mediaPollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') scanMediaElements();
    }, 5000);
    scanMediaElements();
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible' && runtimeActive) {
      scanMediaElements();
    }
  }

  function deactivateController() {
    if (runtimeActive) {
      runtimeActive = false;
      window.removeEventListener('keydown', handleKeydown, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
    if (mediaObserver) {
      mediaObserver.disconnect();
      mediaObserver = null;
    }
    if (mediaPollTimer !== null) {
      clearInterval(mediaPollTimer);
      mediaPollTimer = null;
    }
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    for (const media of Array.from(trackedMediaSet)) {
      untrackMediaElement(media);
    }
  }

  loadVideoSettings().then(() => {
    effectiveEnabled = globalThis.__rightClickOnWebEffectiveEnabled === true;
    if (effectiveEnabled && currentSettings.enabled) {
      activateController();
    }
  });

})();
