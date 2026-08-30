// Right-click on Web — shared helpers
//
// Loaded by content.js (content-script context), popup.js (popup context),
// and background.js (service worker via importScripts). Provides pure
// helpers + chrome.storage Promise wrappers shared across the three
// execution surfaces.
//
// Why a shared module instead of duplicating?
//   - DRY: resolveDomainKey/getHostname/isDomainEnabled must agree
//     across the popup (decides what the user toggled), the content
//     script (decides whether to apply unlocker), and the background
//     service worker (decides whether to migrate defaults).
//   - No build step in this project (per AGENTS.md): browser <script>
//     loading exposes RIGHT_CLICK_ON_WEB_SHARED, while Node require()
//     returns only the pure settings utilities used by unit tests.

const RIGHT_CLICK_ON_WEB_SETTINGS_UTILS = (() => {
  'use strict';

  const MODE_LITE = 'lite';
  const MODE_ULTIMATE = 'ultimate';
  const DEFAULT_MODE = MODE_ULTIMATE;
  const VALID_MODES = Object.freeze([MODE_LITE, MODE_ULTIMATE]);

  const PRESET_SAFE = 'safe';
  const PRESET_SELECTION = 'selection';
  const PRESET_COMPLETE = 'complete';
  const PRESET_UPLOAD_SAFE = 'upload-safe';
  const PRESET_MEDIA_SAFE = 'media-safe';
  const PRESET_CUSTOM = 'custom';
  const DEFAULT_PRESET = PRESET_COMPLETE;
  const VALID_PRESETS = Object.freeze([
    PRESET_SAFE,
    PRESET_SELECTION,
    PRESET_COMPLETE,
    PRESET_UPLOAD_SAFE,
    PRESET_MEDIA_SAFE,
    PRESET_CUSTOM
  ]);
  const FEATURE_KEYS = Object.freeze([
    'contextMenu',
    'selection',
    'copyShortcuts',
    'dragStart',
    'dragDrop',
    'overlayCleanup',
    'printUnhide',
    'shadowDom',
    'ultimateCss'
  ]);
  const DEFAULT_FEATURES = Object.freeze({
    contextMenu: true,
    selection: true,
    copyShortcuts: true,
    dragStart: true,
    dragDrop: true,
    overlayCleanup: true,
    printUnhide: true,
    shadowDom: true,
    ultimateCss: true
  });
  const PRESET_FEATURES = Object.freeze({
    [PRESET_SAFE]: Object.freeze({
      contextMenu: true,
      selection: true,
      copyShortcuts: true,
      dragStart: false,
      dragDrop: false,
      overlayCleanup: false,
      printUnhide: false,
      shadowDom: false,
      ultimateCss: true
    }),
    [PRESET_SELECTION]: Object.freeze({
      contextMenu: false,
      selection: true,
      copyShortcuts: true,
      dragStart: false,
      dragDrop: false,
      overlayCleanup: false,
      printUnhide: true,
      shadowDom: false,
      ultimateCss: true
    }),
    [PRESET_COMPLETE]: DEFAULT_FEATURES,
    [PRESET_UPLOAD_SAFE]: Object.freeze({
      ...DEFAULT_FEATURES,
      dragDrop: false
    }),
    [PRESET_MEDIA_SAFE]: Object.freeze({
      contextMenu: true,
      selection: true,
      copyShortcuts: true,
      dragStart: false,
      dragDrop: false,
      overlayCleanup: false,
      printUnhide: false,
      shadowDom: false,
      ultimateCss: true
    })
  });

  const THEME_DARK = 'dark';
  const THEME_NEON = 'neon';
  const THEME_LIGHT = 'light';
  const DEFAULT_THEME = THEME_DARK;
  const VALID_THEMES = Object.freeze([THEME_DARK, THEME_NEON, THEME_LIGHT]);

  function resolveTheme(stored) {
    return VALID_THEMES.includes(stored) ? stored : DEFAULT_THEME;
  }

  function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype === null) {
      return true;
    }
    const constructorDescriptor = Object.getOwnPropertyDescriptor(prototype, 'constructor');
    const constructor = constructorDescriptor && Object.prototype.hasOwnProperty.call(constructorDescriptor, 'value')
      ? constructorDescriptor.value
      : null;
    return Object.getPrototypeOf(prototype) === null
      && typeof constructor === 'function'
      && constructor.prototype === prototype
      && Function.prototype.toString.call(constructor) === Function.prototype.toString.call(Object);
  }

  function copyFeatureMap(source, defaults) {
    const features = {};
    for (const key of FEATURE_KEYS) {
      features[key] = Object.prototype.hasOwnProperty.call(source, key)
        && typeof source[key] === 'boolean'
        ? source[key]
        : defaults[key];
    }
    return features;
  }

  function parseDomainSetting(value) {
    let enabled = false;
    let mode = DEFAULT_MODE;
    if (value === true) {
      enabled = true;
    } else if (value === false) {
      enabled = false;
    } else if (isPlainObject(value)) {
      enabled = !Object.prototype.hasOwnProperty.call(value, 'enabled') || value.enabled !== false;
      const rawMode = Object.prototype.hasOwnProperty.call(value, 'mode')
        && typeof value.mode === 'string'
        ? value.mode
        : DEFAULT_MODE;
      mode = VALID_MODES.includes(rawMode) ? rawMode : DEFAULT_MODE;
    }

    const requestedPreset = isPlainObject(value)
      && Object.prototype.hasOwnProperty.call(value, 'preset')
      && typeof value.preset === 'string'
      ? value.preset
      : null;
    const hasValidPreset = VALID_PRESETS.includes(requestedPreset);
    let preset = hasValidPreset ? requestedPreset : DEFAULT_PRESET;
    let features;
    if (preset === PRESET_CUSTOM) {
      const customFeatures = Object.prototype.hasOwnProperty.call(value, 'features')
        && isPlainObject(value.features)
        ? value.features
        : {};
      const legacyDefaults = mode === MODE_LITE
        ? { ...DEFAULT_FEATURES, ultimateCss: false }
        : DEFAULT_FEATURES;
      features = copyFeatureMap(customFeatures, legacyDefaults);
    } else if (hasValidPreset && PRESET_FEATURES[preset]) {
      const presetFeatures = mode === MODE_LITE
        ? { ...PRESET_FEATURES[preset], ultimateCss: false }
        : PRESET_FEATURES[preset];
      features = copyFeatureMap(presetFeatures, DEFAULT_FEATURES);
    } else if (mode === MODE_LITE) {
      preset = PRESET_CUSTOM;
      features = copyFeatureMap({}, { ...DEFAULT_FEATURES, ultimateCss: false });
    } else {
      features = copyFeatureMap(DEFAULT_FEATURES, DEFAULT_FEATURES);
    }
    return { enabled, mode, preset, features };
  }

  const OCR_SUPPORTED_LANGUAGES = Object.freeze(['kor', 'eng']);
  const DEFAULT_OCR_LANGUAGE = 'kor+eng';
  const OCR_LANGUAGE_LABELS = Object.freeze({ kor: '한국어', eng: 'English' });

  function normalizeOcrLanguage(value) {
    if (typeof value !== 'string') {
      return DEFAULT_OCR_LANGUAGE;
    }
    const unique = [...new Set(
      value.trim().toLowerCase().split('+').filter((part) => OCR_SUPPORTED_LANGUAGES.includes(part))
    )];
    const ordered = OCR_SUPPORTED_LANGUAGES.filter((lang) => unique.includes(lang));
    return ordered.length > 0 ? ordered.join('+') : DEFAULT_OCR_LANGUAGE;
  }

  function ocrLanguageToList(value) {
    return normalizeOcrLanguage(value).split('+');
  }

  function ocrLanguagesToSetting(languageList) {
    const list = Array.isArray(languageList) ? languageList : [];
    return normalizeOcrLanguage(list.join('+'));
  }

  const MIN_VIDEO_SPEED = 0.1;
  const MAX_VIDEO_SPEED = 16.0;
  const DEFAULT_VIDEO_SPEED = 1.0;
  const DEFAULT_VIDEO_SPEED_SETTINGS = Object.freeze({
    enabled: false,
    defaultSpeed: 1.0,
    speedStep: 0.1,
    bigSpeedStep: 0.5,
    fastForwardSpeed: 3.0,
    rewindTime: 10,
    forwardTime: 10,
    showOsd: true,
    speedLock: true,
    shortcuts: Object.freeze({
      decrease: '[',
      increase: ']',
      bigDecrease: '{',
      bigIncrease: '}',
      reset: 'r',
      preferred: 'g',
      preferredSpeed: 2.0,
      rewind: 'z',
      forward: 'x',
      toggleOsd: 'v'
    }),
    siteSpeeds: Object.freeze({})
  });

  function clampVideoSpeed(speed) {
    const num = typeof speed === 'number' && Number.isFinite(speed) ? speed : DEFAULT_VIDEO_SPEED;
    const clamped = Math.max(MIN_VIDEO_SPEED, Math.min(MAX_VIDEO_SPEED, num));
    return Math.round(clamped * 100) / 100;
  }

  function formatVideoSpeed(speed) {
    const clamped = clampVideoSpeed(speed);
    return clamped.toFixed(2) + 'x';
  }

  function normalizeVideoSpeedSettings(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ...DEFAULT_VIDEO_SPEED_SETTINGS };
    }
    const enabled = raw.enabled === true;
    const defaultSpeed = clampVideoSpeed(raw.defaultSpeed);
    const speedStep = typeof raw.speedStep === 'number' && raw.speedStep > 0 && raw.speedStep <= 2 ? raw.speedStep : 0.1;
    const bigSpeedStep = typeof raw.bigSpeedStep === 'number' && raw.bigSpeedStep > 0 && raw.bigSpeedStep <= 5 ? raw.bigSpeedStep : 0.5;
    const fastForwardSpeed = clampVideoSpeed(raw.fastForwardSpeed || 3.0);
    const rewindTime = typeof raw.rewindTime === 'number' && raw.rewindTime > 0 ? raw.rewindTime : 10;
    const forwardTime = typeof raw.forwardTime === 'number' && raw.forwardTime > 0 ? raw.forwardTime : 10;
    const showOsd = raw.showOsd !== false;
    const speedLock = raw.speedLock !== false;

    const rawShortcuts = raw.shortcuts && typeof raw.shortcuts === 'object' ? raw.shortcuts : {};
    const shortcuts = {
      decrease: typeof rawShortcuts.decrease === 'string' ? rawShortcuts.decrease : '[',
      increase: typeof rawShortcuts.increase === 'string' ? rawShortcuts.increase : ']',
      bigDecrease: typeof rawShortcuts.bigDecrease === 'string' ? rawShortcuts.bigDecrease : '{',
      bigIncrease: typeof rawShortcuts.bigIncrease === 'string' ? rawShortcuts.bigIncrease : '}',
      reset: typeof rawShortcuts.reset === 'string' ? rawShortcuts.reset : 'r',
      preferred: typeof rawShortcuts.preferred === 'string' ? rawShortcuts.preferred : 'g',
      preferredSpeed: clampVideoSpeed(rawShortcuts.preferredSpeed || 2.0),
      rewind: typeof rawShortcuts.rewind === 'string' ? rawShortcuts.rewind : 'z',
      forward: typeof rawShortcuts.forward === 'string' ? rawShortcuts.forward : 'x',
      toggleOsd: typeof rawShortcuts.toggleOsd === 'string' ? rawShortcuts.toggleOsd : 'v'
    };

    const rawSiteSpeeds = raw.siteSpeeds && typeof raw.siteSpeeds === 'object' && !Array.isArray(raw.siteSpeeds) ? raw.siteSpeeds : {};
    const siteSpeeds = {};
    for (const host of Object.keys(rawSiteSpeeds)) {
      if (typeof rawSiteSpeeds[host] === 'number') {
        siteSpeeds[host] = clampVideoSpeed(rawSiteSpeeds[host]);
      }
    }

    return {
      enabled,
      defaultSpeed,
      speedStep,
      bigSpeedStep,
      fastForwardSpeed,
      rewindTime,
      forwardTime,
      showOsd,
      speedLock,
      shortcuts,
      siteSpeeds
    };
  }

  function resolveVideoSpeed(hostname, videoSpeedSettings) {
    const settings = normalizeVideoSpeedSettings(videoSpeedSettings);
    if (!settings.enabled) {
      return 1.0;
    }
    if (hostname && settings.siteSpeeds && typeof settings.siteSpeeds[hostname] === 'number') {
      return clampVideoSpeed(settings.siteSpeeds[hostname]);
    }
    return clampVideoSpeed(settings.defaultSpeed);
  }

  function classifyVideoRateChange(lockedSpeed, observedSpeed, interactionActive) {
    const locked = clampVideoSpeed(lockedSpeed);
    const observed = clampVideoSpeed(observedSpeed);
    if (Math.abs(observed - locked) <= 0.01) return 'matched';
    return interactionActive === true ? 'user' : 'site';
  }

  function normalizeDomainSettings(domainSettings) {
    const out = Object.create(null);
    if (!isPlainObject(domainSettings)) {
      return out;
    }
    for (const host of Object.keys(domainSettings)) {
      out[host] = parseDomainSetting(domainSettings[host]);
    }
    return out;
  }

  return Object.freeze({
    MODE_LITE,
    MODE_ULTIMATE,
    DEFAULT_MODE,
    VALID_MODES,
    PRESET_SAFE,
    PRESET_SELECTION,
    PRESET_COMPLETE,
    PRESET_UPLOAD_SAFE,
    PRESET_MEDIA_SAFE,
    PRESET_CUSTOM,
    DEFAULT_PRESET,
    VALID_PRESETS,
    FEATURE_KEYS,
    DEFAULT_FEATURES,
    PRESET_FEATURES,
    THEME_DARK,
    THEME_NEON,
    THEME_LIGHT,
    DEFAULT_THEME,
    VALID_THEMES,
    resolveTheme,
    parseDomainSetting,
    normalizeDomainSettings,
    OCR_SUPPORTED_LANGUAGES,
    DEFAULT_OCR_LANGUAGE,
    OCR_LANGUAGE_LABELS,
    normalizeOcrLanguage,
    ocrLanguageToList,
    ocrLanguagesToSetting,
    MIN_VIDEO_SPEED,
    MAX_VIDEO_SPEED,
    DEFAULT_VIDEO_SPEED,
    DEFAULT_VIDEO_SPEED_SETTINGS,
    clampVideoSpeed,
    formatVideoSpeed,
    normalizeVideoSpeedSettings,
    resolveVideoSpeed,
    classifyVideoRateChange
  });
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Object.freeze({
    parseDomainSetting: RIGHT_CLICK_ON_WEB_SETTINGS_UTILS.parseDomainSetting,
    normalizeDomainSettings: RIGHT_CLICK_ON_WEB_SETTINGS_UTILS.normalizeDomainSettings,
    resolveTheme: RIGHT_CLICK_ON_WEB_SETTINGS_UTILS.resolveTheme,
    VALID_THEMES: RIGHT_CLICK_ON_WEB_SETTINGS_UTILS.VALID_THEMES,
    DEFAULT_THEME: RIGHT_CLICK_ON_WEB_SETTINGS_UTILS.DEFAULT_THEME,
    OCR_SUPPORTED_LANGUAGES: RIGHT_CLICK_ON_WEB_SETTINGS_UTILS.OCR_SUPPORTED_LANGUAGES,
    DEFAULT_OCR_LANGUAGE: RIGHT_CLICK_ON_WEB_SETTINGS_UTILS.DEFAULT_OCR_LANGUAGE,
    normalizeOcrLanguage: RIGHT_CLICK_ON_WEB_SETTINGS_UTILS.normalizeOcrLanguage,
    ocrLanguageToList: RIGHT_CLICK_ON_WEB_SETTINGS_UTILS.ocrLanguageToList,
    ocrLanguagesToSetting: RIGHT_CLICK_ON_WEB_SETTINGS_UTILS.ocrLanguagesToSetting,
    MIN_VIDEO_SPEED: RIGHT_CLICK_ON_WEB_SETTINGS_UTILS.MIN_VIDEO_SPEED,
    MAX_VIDEO_SPEED: RIGHT_CLICK_ON_WEB_SETTINGS_UTILS.MAX_VIDEO_SPEED,
    DEFAULT_VIDEO_SPEED: RIGHT_CLICK_ON_WEB_SETTINGS_UTILS.DEFAULT_VIDEO_SPEED,
    DEFAULT_VIDEO_SPEED_SETTINGS: RIGHT_CLICK_ON_WEB_SETTINGS_UTILS.DEFAULT_VIDEO_SPEED_SETTINGS,
    clampVideoSpeed: RIGHT_CLICK_ON_WEB_SETTINGS_UTILS.clampVideoSpeed,
    formatVideoSpeed: RIGHT_CLICK_ON_WEB_SETTINGS_UTILS.formatVideoSpeed,
    normalizeVideoSpeedSettings: RIGHT_CLICK_ON_WEB_SETTINGS_UTILS.normalizeVideoSpeedSettings,
    resolveVideoSpeed: RIGHT_CLICK_ON_WEB_SETTINGS_UTILS.resolveVideoSpeed,
    classifyVideoRateChange: RIGHT_CLICK_ON_WEB_SETTINGS_UTILS.classifyVideoRateChange
  });
} else {
(function sharedInit(SETTINGS_UTILS) {
  'use strict';

  const {
    MODE_LITE,
    MODE_ULTIMATE,
    DEFAULT_MODE,
    VALID_MODES,
    PRESET_SAFE,
    PRESET_SELECTION,
    PRESET_COMPLETE,
    PRESET_UPLOAD_SAFE,
    PRESET_MEDIA_SAFE,
    PRESET_CUSTOM,
    DEFAULT_PRESET,
    VALID_PRESETS,
    FEATURE_KEYS,
    DEFAULT_FEATURES,
    PRESET_FEATURES,
    THEME_DARK,
    THEME_NEON,
    THEME_LIGHT,
    DEFAULT_THEME,
    VALID_THEMES,
    resolveTheme,
    parseDomainSetting,
    normalizeDomainSettings,
    OCR_SUPPORTED_LANGUAGES,
    DEFAULT_OCR_LANGUAGE,
    OCR_LANGUAGE_LABELS,
    normalizeOcrLanguage,
    ocrLanguageToList,
    ocrLanguagesToSetting,
    MIN_VIDEO_SPEED,
    MAX_VIDEO_SPEED,
    DEFAULT_VIDEO_SPEED,
    DEFAULT_VIDEO_SPEED_SETTINGS,
    clampVideoSpeed,
    formatVideoSpeed,
    normalizeVideoSpeedSettings,
    resolveVideoSpeed,
    classifyVideoRateChange
  } = SETTINGS_UTILS;

  // Public suffix blocklist — minimal subset of common multi-part TLDs.
  // Used as a safety net: a matching public suffix stops parent-domain
  // traversal, so an accidental "co.uk" or "uk" setting cannot apply
  // across an entire public suffix.
  //
  // This is intentionally NOT the full Public Suffix List. Keeping it
  // compact avoids a multi-MB PSL payload in a no-build extension.
  // Coverage is biased toward the locales the README + UI ship in
  // (Korean/English). If a real-world bug emerges for a TLD below,
  // add the entry — do not switch to a runtime PSL library.
  const PUBLIC_SUFFIX_BLOCKLIST = new Set([
    // United Kingdom
    'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'ltd.uk', 'plc.uk', 'me.uk', 'net.uk',
    // Korea
    'co.kr', 'ne.kr', 'or.kr', 're.kr', 'go.kr', 'pe.kr',
    // Japan
    'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp',
    // Australia
    'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
    // Other multi-part TLDs the team has encountered
    'co.nz', 'co.za', 'co.in', 'com.br', 'com.cn', 'com.tw', 'com.mx',
    'com.sg', 'com.hk', 'com.tr', 'com.ar', 'com.pl'
  ]);

  // Maximum number of parent-domain hops to attempt when matching.
  // Caps pathological inputs and prevents runaway recursion on
  // malformed hostnames. Implemented as an iteration-count cap on
  // the candidate walk. With this depth, hostnames with up to 7
  // labels (e.g. `a.b.c.d.e.example.com`) will have their
  // registrable domain (`example.com`) checked; 8+ label
  // hostnames (6+ subdomains deep) will not, by design.
  const MAX_DOMAIN_MATCH_DEPTH = 5;

  // storage default shape — kept in lockstep with DEFAULT_SETTINGS in
  // background.js and popup.js (legacy single-key shape).
const STORAGE_DEFAULTS = Object.freeze({
    enabled: true,
    domainSettings: Object.freeze({}),
    theme: 'dark',
    ocrLanguage: 'kor+eng',
    videoSpeedSettings: DEFAULT_VIDEO_SPEED_SETTINGS
  });

  // ---- v0.5.0: Lite/Ultimate mode schema ----
  //
  // MODE constants and parseDomainSetting() were added in v0.5.0.
  // Before v0.5.0 domainSettings stored a plain boolean per hostname;
  // v0.5.0 changes the value shape to { enabled, mode }. Old entries
  // are normalized by background.js's migrateDomainSettings() on
  // install/update, but parseDomainSetting() also handles the live
  // case where content script / popup encounter an unmigrated entry.
  const SESSION_KEY_PREFIX = 'session:';
  const LOCAL_FALLBACK_KEYS = '__rightClickOnWebSyncFallbackKeys';

  function sessionKeyFor(hostname) {
    if (!hostname) {
      return null;
    }
    return SESSION_KEY_PREFIX + hostname;
  }

  // Safely extract hostname from a URL string. Returns '' for any
  // non-http(s) scheme (chrome://, about:blank, file://, etc.) and
  // for invalid URLs. Empty string signals "no host context" — callers
  // should fall through to global enabled rather than try to resolve
  // domain-specific settings against an empty/garbage hostname.
  //
  // Hostname is lowercased to match what domainSettings stores
  // (popup.js normalizes before writing). Without this normalization,
  // "Example.com" from the URL bar and "example.com" from a stored
  // entry would fail to match.
  function getHostname(href) {
    if (typeof href !== 'string' || href.length === 0) {
      return '';
    }
    let url;
    try {
      url = new URL(href);
    } catch (_) {
      return '';
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return '';
    }
    const host = url.hostname;
    if (!host) {
      return '';
    }
    return host.toLowerCase();
  }

  // Walk up the domain label hierarchy until we find a registered
  // entry in domainSettings. Returns the matched key (longest/most-
  // specific match wins), or null when no parent matches.
  //
  // Examples (assuming domainSettings = {"example.com": false}):
  //   resolveDomainKey("example.com", {})  -> null
  //   resolveDomainKey("example.com", {..}) -> "example.com"
  //   resolveDomainKey("www.example.com", {..}) -> "example.com"
  //   resolveDomainKey("a.b.c.example.com", {..}) -> "example.com"
  //
  // Public-suffix blocklist entries STOP the walk entirely (we do
  // not return them and do not continue past them). This prevents
  // a user from accidentally registering a top-level TLD entry
  // like "uk": true or "com": false and having it apply to every
  // site under that TLD. Once we hit "co.uk" or "com.au" in the
  // walk, we break — the caller's domainSettings entry for those
  // keys (if any) is ignored, and we never look at "uk" or "au".
  function resolveDomainKey(hostname, domainSettings) {
    if (!hostname || !domainSettings) {
      return null;
    }

    const normalizedHostname = hostname.toLowerCase();
    const parts = normalizedHostname.split('.');
    if (parts.length < 2) {
      return null;
    }

    let candidate = parts.join('.');
    let depth = 0;

    while (parts.length >= 2 && depth <= MAX_DOMAIN_MATCH_DEPTH) {
      // Stop at public-suffix boundary — never match a PSL entry
      // and never walk past it.
      if (PUBLIC_SUFFIX_BLOCKLIST.has(candidate)) {
        break;
      }
      if (Object.prototype.hasOwnProperty.call(domainSettings, candidate)) {
        return candidate;
      }
      parts.shift();
      candidate = parts.join('.');
      depth += 1;
    }
    return null;
  }

  // Resolve whether the unlocker should be enabled for `hostname`,
  // given the current global setting and the domainSettings map.
  // Used by the popup for button-label decisions; the content
  // script applies the same semantics inline in resolveEnabled().
  //
  // Semantics (mirrors user expectation):
  //   global OFF + no domain entry      -> OFF (default)
  //   global OFF + domain entry true    -> ON  (per-site override)
  //   global OFF + domain entry false   -> OFF (explicit exception)
  //   global ON  + no domain entry      -> ON  (default)
  //   global ON  + domain entry true    -> ON
  //   global ON  + domain entry false   -> OFF (per-site exception)
  //
  // Domain entries always win over the global flag when present;
  // only the *absence* of a domain entry falls through to global.
  //
  // v0.5.0: accepts both the new `{ enabled, mode }` shape and the
  // legacy plain-boolean shape. The defensive `boolean` branch
  // tolerates any unmigrated entry the v0.5.0 migration missed; no
  // caller-side normalization is required.
  function isDomainEnabled(globalEnabled, domainSettings, hostname) {
    if (!hostname) {
      return globalEnabled !== false;
    }
    const matched = resolveDomainKey(hostname, domainSettings || {});
    if (matched !== null) {
      const entry = domainSettings[matched];
      // Defensive: tolerate unmigrated boolean entries.
      if (typeof entry === 'boolean') {
        return entry !== false;
      }
      if (entry && typeof entry === 'object') {
        return entry.enabled !== false;
      }
      return false;
    }
    return globalEnabled !== false;
  }

  // Resolve the effective mode for `hostname`. Returns 'lite',
  // 'ultimate', or null when no domain entry applies. Used by
  // content.js to decide whether to inject the CSS user-select
  // override.
  //
  // Semantics:
  //   no domain entry             -> null (caller falls back to DEFAULT_MODE)
  //   domain entry boolean true   -> 'ultimate' (default mode)
  //   domain entry boolean false  -> null (entry says "off"; mode irrelevant)
  //   { enabled: true, mode }     -> mode
  //   { enabled: false, mode }    -> null (caller should skip work entirely)
  function resolveMode(hostname, domainSettings) {
    if (!hostname) {
      return null;
    }
    const matched = resolveDomainKey(hostname, domainSettings || {});
    if (matched === null) {
      return null;
    }
    const entry = domainSettings[matched];
    if (typeof entry === 'boolean') {
      return entry === true ? DEFAULT_MODE : null;
    }
    if (entry && typeof entry === 'object') {
      if (entry.enabled === false) {
        return null;
      }
      return entry.mode === MODE_LITE ? MODE_LITE : MODE_ULTIMATE;
    }
    return null;
  }

  // Promise wrappers around chrome.storage callbacks. Content scripts
  // and the popup prefer await syntax; service workers can use these
  // too. Errors are propagated via lastError.
  function storageGet(area, keys) {
    return new Promise((resolve, reject) => {
      try {
        area.get(keys, (result) => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function storageSet(area, data) {
    return new Promise((resolve, reject) => {
      try {
        area.set(data, () => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function storageRemove(area, keys) {
    return new Promise((resolve, reject) => {
      try {
        area.remove(keys, () => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  // Session mode also requires content-script access. Chromium exposes
  // setAccessLevel() for that contract; API shapes without it cannot keep
  // popup and content-script resolution in agreement.
  function isSessionStorageAvailable() {
    try {
      return Boolean(
        chrome.storage &&
        chrome.storage.session &&
        typeof chrome.storage.session.get === 'function' &&
        typeof chrome.storage.session.setAccessLevel === 'function'
      );
    } catch (_) {
      return false;
    }
  }

  // ---- v0.4.0: chrome.storage.sync helpers ----
  //
  // Sync quota (Chrome docs):
  //   QUOTA_BYTES = 102_400  (total, across all items)
  //   QUOTA_BYTES_PER_ITEM = 8_192  (8 KB per item)
  //   MAX_ITEMS = 512
  //   MAX_WRITE_OPERATIONS_PER_MINUTE = 1_800
  //   MAX_SUSTAINED_WRITE_OPERATIONS_PER_MINUTE = 120
  //
  // Source: https://developer.chrome.com/docs/extensions/reference/api/storage#property-sync
  const SYNC_QUOTA = Object.freeze({
    BYTES_TOTAL: 102_400,
    BYTES_PER_ITEM: 8_192,
    MAX_ITEMS: 512
  });

  // Returns true when chrome.runtime.lastError or a rejected storage
  // operation looks like a quota-related failure. Used by safeSyncSet
  // to decide whether to fall back to chrome.storage.local.
  function isQuotaExceeded(err) {
    if (!err) {
      return false;
    }
    const message = String((err && err.message) || err);
    return /quota|MAX_ITEMS|MAX_WRITE_OPERATIONS|MAX_SUSTAINED/i.test(message);
  }

  // Wrapper around chrome.storage.getBytesInUse for the sync area.
  // Returns 0 when the area is unavailable (e.g. sync disabled in
  // chrome://settings) so callers don't need to special-case that.
  function getBytesInUse(area) {
    return new Promise((resolve) => {
      try {
        if (!area || typeof area.getBytesInUse !== 'function') {
          resolve(0);
          return;
        }
        area.getBytesInUse(null, (bytes) => {
          const err = chrome.runtime.lastError;
          if (err) {
            resolve(0);
          } else {
            resolve(typeof bytes === 'number' ? bytes : 0);
          }
        });
      } catch (_) {
        resolve(0);
      }
    });
  }

  // Try writing to sync; on quota error fall back to local. A local
  // fallback marker makes resolveSettings prefer that local key over an
  // older sync value, so the user's latest action takes effect immediately.
  // A later successful sync write removes the marker again.
  async function safeSyncSet(data, fallbackArea) {
    const keys = Object.keys(data);
    try {
      await storageSet(chrome.storage.sync, data);
      if (fallbackArea) {
        const fallbackData = await storageGet(fallbackArea, [LOCAL_FALLBACK_KEYS]);
        const fallbackKeys = fallbackData[LOCAL_FALLBACK_KEYS];
        if (fallbackKeys && typeof fallbackKeys === 'object') {
          const remaining = { ...fallbackKeys };
          for (const key of keys) {
            delete remaining[key];
          }
          try {
            if (Object.keys(remaining).length === 0) {
              await storageRemove(fallbackArea, LOCAL_FALLBACK_KEYS);
            } else {
              await storageSet(fallbackArea, { [LOCAL_FALLBACK_KEYS]: remaining });
            }
          } catch (_) {}
        }
      }
      return { area: 'sync' };
    } catch (err) {
      if (isQuotaExceeded(err) && fallbackArea) {
        const fallbackData = await storageGet(fallbackArea, [LOCAL_FALLBACK_KEYS]);
        const fallbackKeys = fallbackData[LOCAL_FALLBACK_KEYS];
        const nextFallbackKeys = fallbackKeys && typeof fallbackKeys === 'object'
          ? { ...fallbackKeys }
          : {};
        for (const key of keys) {
          nextFallbackKeys[key] = true;
        }
        await storageSet(fallbackArea, {
          ...data,
          [LOCAL_FALLBACK_KEYS]: nextFallbackKeys
        });
        return { area: 'local', fallback: true, reason: err.message };
      }
      throw err;
    }
  }

  // Read sync + local in parallel and merge with sync winning on
  // conflict, except keys explicitly marked as a current-device quota
  // fallback. Returns {} on total failure so callers can treat it as
  // "no settings found".
  async function resolveSettings(keys) {
    const safe = (promise) => promise.then((v) => v).catch(() => ({}));
    const requestedKeys = Object.keys(keys);
    const [syncData, localData] = await Promise.all([
      safe(storageGet(chrome.storage.sync, requestedKeys)),
      safe(storageGet(chrome.storage.local, [...requestedKeys, LOCAL_FALLBACK_KEYS]))
    ]);
    const fallbackKeys = localData[LOCAL_FALLBACK_KEYS];
    delete localData[LOCAL_FALLBACK_KEYS];
    // sync wins — most recent cross-device state.
    const resolved = Object.assign({}, keys, localData, syncData);
    if (fallbackKeys && typeof fallbackKeys === 'object') {
      for (const key of Object.keys(fallbackKeys)) {
        if (Object.prototype.hasOwnProperty.call(localData, key)) {
          resolved[key] = localData[key];
        }
      }
    }
    return resolved;
  }

  // Single export — content.js and popup.js both access via
  // window.RIGHT_CLICK_ON_WEB_SHARED.* (or the bare global in
  // service-worker context where importScripts makes these top-level).
  const exportObject = {
    PUBLIC_SUFFIX_BLOCKLIST,
    MAX_DOMAIN_MATCH_DEPTH,
    STORAGE_DEFAULTS,
    SESSION_KEY_PREFIX,
    LOCAL_FALLBACK_KEYS,
    SYNC_QUOTA,
    MODE_LITE,
    MODE_ULTIMATE,
    DEFAULT_MODE,
    VALID_MODES,
    PRESET_SAFE,
    PRESET_SELECTION,
    PRESET_COMPLETE,
    PRESET_UPLOAD_SAFE,
    PRESET_MEDIA_SAFE,
    PRESET_CUSTOM,
    DEFAULT_PRESET,
    VALID_PRESETS,
    FEATURE_KEYS,
    DEFAULT_FEATURES,
    PRESET_FEATURES,
    THEME_DARK,
    THEME_NEON,
    THEME_LIGHT,
    DEFAULT_THEME,
    VALID_THEMES,
    resolveTheme,
    sessionKeyFor,
    getHostname,
    resolveDomainKey,
    isDomainEnabled,
    resolveMode,
    parseDomainSetting,
    normalizeDomainSettings,
    storageGet,
    storageSet,
    storageRemove,
    isSessionStorageAvailable,
    isQuotaExceeded,
    getBytesInUse,
    safeSyncSet,
    resolveSettings,
    OCR_SUPPORTED_LANGUAGES,
    DEFAULT_OCR_LANGUAGE,
    OCR_LANGUAGE_LABELS,
    normalizeOcrLanguage,
    ocrLanguageToList,
    ocrLanguagesToSetting,
    MIN_VIDEO_SPEED,
    MAX_VIDEO_SPEED,
    DEFAULT_VIDEO_SPEED,
    DEFAULT_VIDEO_SPEED_SETTINGS,
    clampVideoSpeed,
    formatVideoSpeed,
    normalizeVideoSpeedSettings,
    resolveVideoSpeed,
    classifyVideoRateChange
  };

  if (typeof globalThis !== 'undefined') {
    globalThis.RIGHT_CLICK_ON_WEB_SHARED = exportObject;
  }
})(RIGHT_CLICK_ON_WEB_SETTINGS_UTILS);
}
