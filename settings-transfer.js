(function settingsTransferInit(root, factory) {
  'use strict';

  const shared = typeof module !== 'undefined' && module.exports
    ? require('./shared.js')
    : root.RIGHT_CLICK_ON_WEB_SHARED;
  const api = factory(shared);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.RIGHT_CLICK_ON_WEB_SETTINGS_TRANSFER = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSettingsTransfer(SHARED) {
  'use strict';

  const SCHEMA_VERSION = 1;
  const MAX_BACKUP_BYTES = 100 * 1024;
  const MAX_DOMAIN_ENTRY_BYTES = 8 * 1024;
  const MAX_DOMAIN_COUNT = 512;
  const MAX_HOSTNAME_BYTES = 253;
  const MAX_HOSTNAME_LABELS = 5;
  const MAX_HOSTNAME_LABEL_BYTES = 63;
  const BACKUP_KEYS = Object.freeze(['schemaVersion', 'exportedAt', 'extensionVersion', 'settings']);
  const SETTINGS_KEYS = Object.freeze(['enabled', 'theme', 'ocrLanguage', 'domainSettings']);
  const DOMAIN_SETTING_KEYS = Object.freeze(['enabled', 'mode', 'preset', 'features']);
  const FEATURE_KEYS = Object.freeze([
    'contextMenu', 'selection', 'copyShortcuts', 'dragStart', 'dragDrop',
    'overlayCleanup', 'printUnhide', 'shadowDom', 'ultimateCss'
  ]);
  const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const FALLBACK_PUBLIC_SUFFIXES = new Set([
    'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'ltd.uk', 'plc.uk', 'me.uk', 'net.uk',
    'co.kr', 'ne.kr', 'or.kr', 're.kr', 'go.kr', 'pe.kr',
    'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp',
    'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
    'co.nz', 'co.za', 'co.in', 'com.br', 'com.cn', 'com.tw', 'com.mx',
    'com.sg', 'com.hk', 'com.tr', 'com.ar', 'com.pl'
  ]);

  function utf8ByteLength(value) {
    const text = typeof value === 'string' ? value : '';
    let bytes = 0;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if (code <= 0x7f) bytes += 1;
      else if (code <= 0x7ff) bytes += 2;
      else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length &&
          text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    }
    return bytes;
  }

  function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype === null) {
      return true;
    }
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'constructor');
    return Object.getPrototypeOf(prototype) === null && descriptor &&
      typeof descriptor.value === 'function' && descriptor.value.name === 'Object';
  }

  function hasOnlyKeys(value, allowedKeys) {
    if (!isPlainObject(value)) {
      return false;
    }
    return Object.keys(value).every((key) => !RESERVED_KEYS.has(key) && allowedKeys.includes(key));
  }

  function publicSuffixes() {
    return SHARED && SHARED.PUBLIC_SUFFIX_BLOCKLIST instanceof Set
      ? SHARED.PUBLIC_SUFFIX_BLOCKLIST
      : FALLBACK_PUBLIC_SUFFIXES;
  }

  function normalizeHostname(hostname) {
    if (typeof hostname !== 'string' || utf8ByteLength(hostname) === 0 ||
        utf8ByteLength(hostname) > MAX_HOSTNAME_BYTES || /[/?#:@\\]/.test(hostname)) {
      return null;
    }
    const normalized = hostname.toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(normalized) || normalized.includes('..')) {
      return null;
    }
    const labels = normalized.split('.');
    if (labels.length < 2 || labels.length > MAX_HOSTNAME_LABELS ||
        labels.some((label) => utf8ByteLength(label) > MAX_HOSTNAME_LABEL_BYTES)) {
      return null;
    }
    return publicSuffixes().has(normalized) ? null : normalized;
  }

  function normalizeOcrLanguage(value) {
    return typeof value === 'string' && /^[a-z]{2,24}(?:\+[a-z]{2,24})?$/i.test(value)
      ? value.toLowerCase()
      : null;
  }

  function isValidDomainEntry(value) {
    if (typeof value === 'boolean') {
      return true;
    }
    if (!hasOnlyKeys(value, DOMAIN_SETTING_KEYS)) {
      return false;
    }
    if (Object.prototype.hasOwnProperty.call(value, 'enabled') && typeof value.enabled !== 'boolean' ||
        Object.prototype.hasOwnProperty.call(value, 'mode') && typeof value.mode !== 'string' ||
        Object.prototype.hasOwnProperty.call(value, 'preset') && typeof value.preset !== 'string') {
      return false;
    }
    if (!Object.prototype.hasOwnProperty.call(value, 'features')) {
      return true;
    }
    return hasOnlyKeys(value.features, FEATURE_KEYS) &&
      Object.keys(value.features).every((key) => typeof value.features[key] === 'boolean');
  }

  function normalizeSettings(settings) {
    const raw = isPlainObject(settings) ? settings : {};
    const domainSettings = Object.create(null);
    const rawDomains = isPlainObject(raw.domainSettings) ? raw.domainSettings : {};
    for (const hostname of Object.keys(rawDomains)) {
      const normalizedHostname = normalizeHostname(hostname);
      if (!normalizedHostname || !isValidDomainEntry(rawDomains[hostname])) {
        continue;
      }
      domainSettings[normalizedHostname] = SHARED.parseDomainSetting(rawDomains[hostname]);
    }
    const normalized = {
      enabled: raw.enabled !== false,
      theme: SHARED.resolveTheme(raw.theme),
      domainSettings
    };
    const ocrLanguage = normalizeOcrLanguage(raw.ocrLanguage);
    if (ocrLanguage) {
      normalized.ocrLanguage = ocrLanguage;
    }
    return normalized;
  }

  function exportSettings(settings, metadata = {}) {
    const normalized = normalizeSettings(settings);
    const exportedAt = Number.isSafeInteger(metadata.exportedAt) && metadata.exportedAt >= 0
      ? metadata.exportedAt
      : Date.now();
    const extensionVersion = typeof metadata.extensionVersion === 'string' &&
      /^[0-9A-Za-z][0-9A-Za-z.-]{0,63}$/.test(metadata.extensionVersion)
      ? metadata.extensionVersion
      : 'unknown';
    return {
      schemaVersion: SCHEMA_VERSION,
      exportedAt,
      extensionVersion,
      settings: normalized
    };
  }

  function reject(code) {
    return Object.freeze({ ok: false, code });
  }

  function validateSettingsBackup(input) {
    let backup = input;
    if (typeof input === 'string') {
      if (utf8ByteLength(input) > MAX_BACKUP_BYTES) {
        return reject('backup-too-large');
      }
      try {
        backup = JSON.parse(input);
      } catch (_) {
        return reject('malformed-json');
      }
    }
    if (!isPlainObject(backup) || !hasOnlyKeys(backup, BACKUP_KEYS) ||
        backup.schemaVersion !== SCHEMA_VERSION || !Number.isSafeInteger(backup.exportedAt) ||
        backup.exportedAt < 0 || typeof backup.extensionVersion !== 'string' ||
        !/^[0-9A-Za-z][0-9A-Za-z.-]{0,63}$/.test(backup.extensionVersion) ||
        !hasOnlyKeys(backup.settings, SETTINGS_KEYS)) {
      return reject('invalid-schema');
    }
    const settings = backup.settings;
    if (typeof settings.enabled !== 'boolean' || typeof settings.theme !== 'string' ||
        (Object.prototype.hasOwnProperty.call(settings, 'ocrLanguage') && !normalizeOcrLanguage(settings.ocrLanguage)) ||
        !isPlainObject(settings.domainSettings)) {
      return reject('invalid-settings');
    }
    const hosts = Object.keys(settings.domainSettings);
    if (hosts.length > MAX_DOMAIN_COUNT) {
      return reject('too-many-domains');
    }
    for (const hostname of hosts) {
      const entry = settings.domainSettings[hostname];
      if (!normalizeHostname(hostname) || !isValidDomainEntry(entry) ||
          utf8ByteLength(JSON.stringify({ [hostname]: entry })) > MAX_DOMAIN_ENTRY_BYTES) {
        return reject('invalid-domain-settings');
      }
    }
    const normalized = normalizeSettings(settings);
    const safeBackup = exportSettings(normalized, {
      exportedAt: backup.exportedAt,
      extensionVersion: backup.extensionVersion
    });
    const serialized = JSON.stringify(safeBackup);
    if (utf8ByteLength(serialized) > MAX_BACKUP_BYTES) {
      return reject('backup-too-large');
    }
    return Object.freeze({ ok: true, value: safeBackup });
  }

  function entriesEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function planSettingsImport(backup, currentSettings, options = {}) {
    const validation = validateSettingsBackup(backup);
    if (!validation.ok) {
      return validation;
    }
    const current = normalizeSettings(currentSettings);
    const incoming = validation.value.settings;
    const replace = options.replace === true;
    const domainSettings = Object.create(null);
    const added = [];
    const changed = [];
    const removed = [];

    if (!replace) {
      for (const hostname of Object.keys(current.domainSettings)) {
        domainSettings[hostname] = current.domainSettings[hostname];
      }
    }
    for (const hostname of Object.keys(incoming.domainSettings)) {
      if (!Object.prototype.hasOwnProperty.call(current.domainSettings, hostname)) {
        added.push(hostname);
      } else if (!entriesEqual(current.domainSettings[hostname], incoming.domainSettings[hostname])) {
        changed.push(hostname);
      }
      domainSettings[hostname] = incoming.domainSettings[hostname];
    }
    if (replace) {
      for (const hostname of Object.keys(current.domainSettings)) {
        if (!Object.prototype.hasOwnProperty.call(incoming.domainSettings, hostname)) {
          removed.push(hostname);
        }
      }
    }
    const settings = {
      enabled: incoming.enabled,
      theme: incoming.theme,
      domainSettings
    };
    if (incoming.ocrLanguage) {
      settings.ocrLanguage = incoming.ocrLanguage;
    }
    return Object.freeze({
      ok: true,
      mode: replace ? 'replace' : 'merge',
      settings,
      summary: Object.freeze({
        added: Object.freeze(added),
        changed: Object.freeze(changed),
        removed: Object.freeze(removed)
      })
    });
  }

  return Object.freeze({
    SCHEMA_VERSION,
    MAX_BACKUP_BYTES,
    MAX_DOMAIN_ENTRY_BYTES,
    MAX_DOMAIN_COUNT,
    exportSettings,
    validateSettingsBackup,
    planSettingsImport
  });
});
