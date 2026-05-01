const DEFAULT_SETTINGS = {
  enabled: true
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
    chrome.storage.local.set({
      enabled: settings.enabled !== false
    });
  });
});
