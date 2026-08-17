(function toolbarActionUtilsInit(root, factory) {
  'use strict';

  const utils = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = utils;
  } else {
    root.RIGHT_CLICK_ON_WEB_TOOLBAR_ACTION_UTILS = utils;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createToolbarActionUtils() {
  'use strict';

  const STATES = Object.freeze({
    OFF: Object.freeze({ badgeText: 'OFF', title: 'Right-click on Web: 현재 사이트에서 꺼짐' }),
    LITE: Object.freeze({ badgeText: 'L', title: 'Right-click on Web: 현재 사이트 Lite 모드' }),
    ULTIMATE: Object.freeze({ badgeText: 'U', title: 'Right-click on Web: 현재 사이트 Ultimate 모드' }),
    SESSION: Object.freeze({ badgeText: 'S', title: 'Right-click on Web: 현재 사이트 세션 임시 활성화' })
  });

  function resolveToolbarActionState({ enabled, mode, sessionActive }) {
    if (sessionActive) {
      return STATES.SESSION;
    }
    if (!enabled) {
      return STATES.OFF;
    }
    return mode === 'lite' ? STATES.LITE : STATES.ULTIMATE;
  }

  async function callActionMethod(action, method, details) {
    try {
      if (!action || typeof action[method] !== 'function') {
        return false;
      }
      await action[method](details);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function applyToolbarActionState(action, tabId, state) {
    if (!Number.isInteger(tabId)) {
      return false;
    }
    const details = { tabId };
    const results = await Promise.all([
      callActionMethod(action, 'setBadgeText', { ...details, text: state.badgeText }),
      callActionMethod(action, 'setTitle', { ...details, title: state.title })
    ]);
    return results.every(Boolean);
  }

  return Object.freeze({
    STATES,
    resolveToolbarActionState,
    applyToolbarActionState
  });
});
