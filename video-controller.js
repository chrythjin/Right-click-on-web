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
  let mediaPollTimer = null;
  let runtimeActive = false;
  let mediaObserver = null;

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

    // Apply current speed
    applySpeedToElement(media, currentSpeed);

    // Create OSD overlay if video
    if (media instanceof HTMLVideoElement && currentSettings.showOsd) {
      ensureOsdForVideo(media, controller.signal);
    }

    media.addEventListener('play', () => {
      if (!effectiveEnabled || !currentSettings.enabled) return;
      applySpeedToElement(media, currentSpeed);
      updateOsdForVideo(media);
    }, { passive: true, signal: controller.signal });

    media.addEventListener('ratechange', () => {
      if (!effectiveEnabled || !currentSettings.enabled) return;
      // If site tries to change rate and lock is enabled, re-assert our speed
      if (currentSettings.speedLock && Math.abs(media.playbackRate - currentSpeed) > 0.01) {
        applySpeedToElement(media, currentSpeed);
      }
      updateOsdForVideo(media);
    }, { passive: true, signal: controller.signal });

    media.addEventListener('emptied', () => {
      setTimeout(() => {
        if (effectiveEnabled && currentSettings.enabled) applySpeedToElement(media, currentSpeed);
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
    trackedMediaSet.delete(media);
  }

  // ---------------------------------------------------------------------------
  // 3. Playback speed enforcement
  // ---------------------------------------------------------------------------

  function applySpeedToElement(media, speed) {
    if (!media || !(media instanceof HTMLMediaElement)) return;
    const clamped = SHARED.clampVideoSpeed(speed);
    try {
      media.playbackRate = clamped;
      if (typeof media.defaultPlaybackRate === 'number') {
        media.defaultPlaybackRate = clamped;
      }
    } catch (_) {}
    updateOsdForVideo(media);
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
        applySpeedToElement(media, currentSpeed);
      } else {
        untrackMediaElement(media);
      }
    }
  }

  function applySpeedToMedia(mediaList, speed, save = true) {
    if (!effectiveEnabled || !currentSettings.enabled || mediaList.length === 0) return;
    updateCurrentSpeed(speed, save);
    for (const media of mediaList) {
      applySpeedToElement(media, currentSpeed);
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

  function ensureOsdForVideo(video, signal) {
    if (!(video instanceof HTMLVideoElement)) return;
    let osd = mediaOsdMap.get(video);
    if (osd && osd.parentElement) return;

    osd = document.createElement('div');
    osd.className = 'rcow-video-osd';
    osd.setAttribute('aria-label', 'Right-click on Web 동영상 배속 컨트롤러');
    osd.innerHTML = `
      <div class="rcow-osd-drag-handle">
        <span class="rcow-osd-brand">RC</span>
      </div>
      <button type="button" class="rcow-osd-btn rcow-osd-btn-dec" title="배속 감소 (단축키: [)">-</button>
      <button type="button" class="rcow-osd-text" title="현재 배속 (휠로 조절 / 클릭하여 리셋)" aria-label="현재 배속 ${SHARED.formatVideoSpeed(currentSpeed)}. 클릭하여 1.0배로 초기화">${SHARED.formatVideoSpeed(currentSpeed)}</button>
      <button type="button" class="rcow-osd-btn rcow-osd-btn-inc" title="배속 증가 (단축키: ])">+</button>
      <button type="button" class="rcow-osd-btn rcow-osd-btn-reset" title="1.0x 리셋 (단축키: R)">↺</button>
      <button type="button" class="rcow-osd-btn rcow-osd-btn-close" title="OSD 숨기기 (단축키: V)">×</button>
    `;

    // Event listeners for OSD buttons
    const decBtn = osd.querySelector('.rcow-osd-btn-dec');
    const incBtn = osd.querySelector('.rcow-osd-btn-inc');
    const textEl = osd.querySelector('.rcow-osd-text');
    const resetBtn = osd.querySelector('.rcow-osd-btn-reset');
    const closeBtn = osd.querySelector('.rcow-osd-btn-close');

    decBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      adjustSpeed(-currentSettings.speedStep);
    }, { signal });

    incBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      adjustSpeed(currentSettings.speedStep);
    }, { signal });

    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      applySpeedToAllMedia(1.0);
    }, { signal });

    textEl.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      applySpeedToAllMedia(1.0);
    }, { signal });

    textEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY < 0 ? 0.05 : -0.05;
      adjustSpeed(delta);
    }, { passive: false, signal });

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      currentSettings.showOsd = false;
      updateAllOsd();
    }, { signal });

    // Drag-to-reposition logic
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let osdStartX = 0;
    let osdStartY = 0;

    const dragHandle = osd.querySelector('.rcow-osd-drag-handle');
    dragHandle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const rect = osd.getBoundingClientRect();
      osdStartX = rect.left;
      osdStartY = rect.top;
      e.preventDefault();
    }, { signal });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      osd.style.left = `${Math.max(10, osdStartX + dx)}px`;
      osd.style.top = `${Math.max(10, osdStartY + dy)}px`;
      osd.style.right = 'auto';
      osd.style.bottom = 'auto';
    }, { signal });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    }, { signal });

    // Mount OSD adjacent to video or in document.body
    if (video.parentElement && getComputedStyle(video.parentElement).position !== 'static') {
      video.parentElement.appendChild(osd);
    } else {
      document.body.appendChild(osd);
    }

    mediaOsdMap.set(video, osd);
    positionOsd(video, osd);
  }

  function positionOsd(video, osd) {
    if (!video || !osd || !document.contains(video)) return;
    const rect = video.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || rect.bottom < 0 || rect.top > window.innerHeight) {
      osd.style.display = 'none';
      return;
    }
    osd.style.display = currentSettings.showOsd ? 'flex' : 'none';
    if (!osd.style.left && !osd.style.top) {
      osd.style.position = 'fixed';
      osd.style.left = `${Math.max(10, rect.left + 12)}px`;
      osd.style.top = `${Math.max(10, rect.top + 12)}px`;
    }
  }

  function updateOsdForVideo(video) {
    if (!(video instanceof HTMLVideoElement)) return;
    const osd = mediaOsdMap.get(video);
    if (!osd) return;
    const textEl = osd.querySelector('.rcow-osd-text');
    if (textEl) {
      textEl.textContent = SHARED.formatVideoSpeed(currentSpeed);
      textEl.setAttribute('aria-label', `현재 배속 ${SHARED.formatVideoSpeed(currentSpeed)}. 클릭하여 1.0배로 초기화`);
    }
    positionOsd(video, osd);
  }

  function updateAllOsd() {
    for (const media of trackedMediaSet) {
      if (media instanceof HTMLVideoElement) {
        if (currentSettings.showOsd && !mediaOsdMap.has(media)) {
          const controller = mediaControllerMap.get(media);
          if (controller) ensureOsdForVideo(media, controller.signal);
        }
        updateOsdForVideo(media);
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
      ? event.target.closest('video, audio, .rcow-video-osd')
      : null;
    let focusedMedia = targetElement instanceof HTMLMediaElement ? targetElement : null;
    if (!focusedMedia && targetElement) {
      for (const [media, osd] of mediaOsdMap) {
        if (osd === targetElement) {
          focusedMedia = media;
          break;
        }
      }
    }
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
    window.addEventListener('scroll', updateAllOsd, { passive: true });
    window.addEventListener('resize', updateAllOsd, { passive: true });
    document.addEventListener('fullscreenchange', updateAllOsd, { passive: true });
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
      window.removeEventListener('scroll', updateAllOsd);
      window.removeEventListener('resize', updateAllOsd);
      document.removeEventListener('fullscreenchange', updateAllOsd);
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
