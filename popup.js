const STORAGE_DEFAULTS = {
  enabled: true
};

const toggleButton = document.getElementById('toggleButton');
const statusText = document.getElementById('statusText');

function render(enabled) {
  toggleButton.textContent = enabled ? 'ON' : 'OFF';
  toggleButton.classList.toggle('is-off', !enabled);
  toggleButton.setAttribute('aria-pressed', String(enabled));
  statusText.textContent = enabled ? '차단 완화 활성화' : '차단 완화 비활성화';
}

chrome.storage.local.get(STORAGE_DEFAULTS, (settings) => {
  render(settings.enabled !== false);
});

toggleButton.addEventListener('click', () => {
  chrome.storage.local.get(STORAGE_DEFAULTS, (settings) => {
    const nextEnabled = settings.enabled === false;
    chrome.storage.local.set({ enabled: nextEnabled }, () => {
      render(nextEnabled);
    });
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes.enabled) {
    return;
  }

  render(changes.enabled.newValue !== false);
});
