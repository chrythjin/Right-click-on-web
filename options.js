'use strict';

const SHARED = globalThis.RIGHT_CLICK_ON_WEB_SHARED;
const state = {
  globalEnabled: true,
  domainSettings: {},
  syncBytesInUse: 0,
  syncAvailable: false,
  lastWriteFallback: false
};

const elements = {
  globalStatus: document.getElementById('globalStatus'),
  globalToggle: document.getElementById('globalToggle'),
  siteCount: document.getElementById('siteCount'),
  siteList: document.getElementById('siteList'),
  syncUsage: document.getElementById('syncUsage'),
  siteRowTemplate: document.getElementById('siteRowTemplate'),
  sidePanelHint: document.querySelector('.side-panel-hint')
};

for (const [name, el] of Object.entries(elements)) {
  if (!el) {
    throw new Error(`options.js: missing required element #${name}`);
  }
}

async function loadState() {
  const settings = await SHARED.resolveSettings(SHARED.STORAGE_DEFAULTS);
  state.globalEnabled = settings.enabled !== false;
  state.domainSettings = settings.domainSettings && typeof settings.domainSettings === 'object'
    ? settings.domainSettings
    : {};

  try {
    state.syncBytesInUse = await SHARED.getBytesInUse(chrome.storage.sync);
    state.syncAvailable = state.syncBytesInUse > 0;
  } catch (_) {
    state.syncAvailable = false;
  }
}

function renderSyncUsage() {
  if (state.syncAvailable) {
    const total = (SHARED.SYNC_QUOTA && SHARED.SYNC_QUOTA.BYTES_TOTAL) || 1;
    const kb = Math.round(state.syncBytesInUse / 1024);
    const limitKb = Math.round(total / 1024);
    const pct = Math.round((state.syncBytesInUse / total) * 100);
    elements.syncUsage.textContent = `동기화 사용량: ${kb}KB / ${limitKb}KB (${Number.isFinite(pct) ? pct : 0}%)`;
  } else if (state.lastWriteFallback) {
    elements.syncUsage.textContent = '동기화 사용 불가 — 현재 기기에만 저장됨';
  } else {
    elements.syncUsage.textContent = '동기화 저장소에 아직 설정이 없습니다. 첫 설정 변경 시 Chrome Sync를 사용합니다.';
  }
}

function renderGlobalState() {
  elements.globalStatus.textContent = state.globalEnabled
    ? '전역 차단 완화 활성화'
    : '전역 차단 완화 비활성화';
  elements.globalToggle.textContent = state.globalEnabled ? 'ON' : 'OFF';
  elements.globalToggle.classList.toggle('is-off', !state.globalEnabled);
  elements.globalToggle.setAttribute('aria-pressed', String(state.globalEnabled));
}

function createSiteRow(hostname, rawSetting) {
  const entry = SHARED.parseDomainSetting(rawSetting);
  const fragment = elements.siteRowTemplate.content.cloneNode(true);
  const row = fragment.querySelector('.site-row');
  const hostnameElement = fragment.querySelector('.site-hostname');
  const stateElement = fragment.querySelector('.site-state');
  const toggle = fragment.querySelector('.site-toggle');
  const lite = fragment.querySelector('.site-mode-lite');
  const ultimate = fragment.querySelector('.site-mode-ultimate');
  const remove = fragment.querySelector('.delete-button');

  hostnameElement.textContent = hostname;
  stateElement.textContent = entry.enabled ? '이 사이트에서 항상 ON' : '이 사이트에서 항상 OFF';
  toggle.textContent = entry.enabled ? 'ON' : 'OFF';
  toggle.classList.toggle('is-off', !entry.enabled);
  toggle.setAttribute('aria-pressed', String(entry.enabled));
  lite.classList.toggle('is-active', entry.mode === SHARED.MODE_LITE);
  ultimate.classList.toggle('is-active', entry.mode === SHARED.MODE_ULTIMATE);
  lite.setAttribute('aria-checked', String(entry.mode === SHARED.MODE_LITE));
  ultimate.setAttribute('aria-checked', String(entry.mode === SHARED.MODE_ULTIMATE));

  toggle.addEventListener('click', () => updateDomain(hostname, (current) => ({ enabled: !current.enabled, mode: current.mode })));
  lite.addEventListener('click', () => updateDomain(hostname, (current) => ({ enabled: current.enabled, mode: SHARED.MODE_LITE })));
  ultimate.addEventListener('click', () => updateDomain(hostname, (current) => ({ enabled: current.enabled, mode: SHARED.MODE_ULTIMATE })));
  remove.addEventListener('click', () => removeDomain(hostname));
  return row;
}

function renderSites() {
  const entries = Object.entries(state.domainSettings)
    .sort(([left], [right]) => left.localeCompare(right));
  elements.siteCount.textContent = `${entries.length}개`;
  elements.siteList.replaceChildren();
  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = '저장된 사이트별 설정이 없습니다. 웹페이지의 확장 팝업에서 사이트 설정을 만들 수 있습니다.';
    elements.siteList.append(empty);
    return;
  }
  for (const [hostname, setting] of entries) {
    elements.siteList.append(createSiteRow(hostname, setting));
  }
}

function render() {
  renderGlobalState();
  renderSites();
  renderSyncUsage();
  renderSidePanelHint();
}

function renderSidePanelHint() {
  if (!elements.sidePanelHint) {
    return;
  }
  const supported = typeof chrome !== 'undefined' && chrome.sidePanel && typeof chrome.sidePanel.open === 'function';
  elements.sidePanelHint.classList.toggle('is-hidden', !supported);
}

let writePromise = Promise.resolve();
function persist(createData) {
  const write = async () => {
    const result = await SHARED.safeSyncSet(await createData(), chrome.storage.local);
    state.lastWriteFallback = Boolean(result && result.fallback);
    await reload();
  };
  writePromise = writePromise.catch(() => {}).then(write);
  return writePromise;
}

async function handleGlobalToggle() {
  await persist(async () => {
    const settings = await SHARED.resolveSettings(SHARED.STORAGE_DEFAULTS);
    return { enabled: settings.enabled === false };
  });
}

async function updateDomain(hostname, update) {
  await persist(async () => {
    const settings = await SHARED.resolveSettings(SHARED.STORAGE_DEFAULTS);
    const domainSettings = settings.domainSettings && typeof settings.domainSettings === 'object'
      ? settings.domainSettings
      : {};
    return { domainSettings: { ...domainSettings, [hostname]: update(SHARED.parseDomainSetting(domainSettings[hostname])) } };
  });
}

async function removeDomain(hostname) {
  if (typeof window.confirm === 'function' && !window.confirm(`'${hostname}' 사이트 설정을 삭제하시겠습니까? 삭제 후 이 사이트는 전역 기본값을 따릅니다.`)) {
    return;
  }
  await persist(async () => {
    const settings = await SHARED.resolveSettings(SHARED.STORAGE_DEFAULTS);
    const domainSettings = { ...(settings.domainSettings || {}) };
    delete domainSettings[hostname];
    return { domainSettings };
  });
}

let reloadPromise = null;
function reload() {
  if (!reloadPromise) {
    reloadPromise = loadState().then(render).finally(() => { reloadPromise = null; });
  }
  return reloadPromise;
}

elements.globalToggle.addEventListener('click', () => handleGlobalToggle().catch(console.error));
chrome.storage.onChanged.addListener((changes, areaName) => {
  if ((areaName === 'local' || areaName === 'sync') && (changes.enabled || changes.domainSettings)) {
    reload().catch(console.error);
  }
});

reload().catch((error) => {
  console.error('[Right-click on Web] failed to load options', error);
});
