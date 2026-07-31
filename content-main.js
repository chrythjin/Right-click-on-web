// Right-click on Web --MAIN world prototype patcher
// Runs at document_start in the page's own JavaScript context, BEFORE
// any page script registers listeners or attaches shadow roots.
//
// Strategy:
//   1. Replace addEventListener registrations for a narrow set of
//      blocking event types with a sentinel no-op listener. The page
//      believes the listener was registered, but the no-op does
//      nothing --no preventDefault, no stopPropagation. Default
//      browser behavior (context menu, copy, drag, etc.) proceeds.
//
//      Why a no-op instead of a silent return? AbortSignal-based
//      registrations (`addEventListener('contextmenu', handler, {signal})`)
//      would later throw via `controller.abort()` or `removeEventListener`
//      if the listener was never registered. Registering a no-op preserves
//      the spec contract while still neutralizing the page's handler.
//
//      Scope: only events whose handlers are used almost exclusively
//      for blocking browser defaults go through MAIN. Broader events
//      with legitimate application uses (paste into editors, drop into
//      upload zones, mousedown for drag, touchstart/touchend for
//      gestures) are handled by content.js in the isolated world,
//      which can exempt editable targets at the capture-phase call
//      site. This keeps page-side interactivity intact.
//
//   2. Convert Element.attachShadow({mode:'closed'}) to mode:'open' so
//      the isolated-world content script can later traverse them.
//
// Cross-reference: BLOCKED_EVENT_NAMES below is a subset of
// RIGHT_CLICK_ON_WEB.blockedEvents in content.js. The remaining entries
// (dragover, drop, mousedown, mouseup, touchstart, touchend, touchmove)
// have legitimate non-blocking uses, so the ISOLATED-world capture-phase
// interceptor handles them with editable-target exemption.
//
// Toggle semantics: this script runs unconditionally on every page
// load (it is declared in manifest.json). Toggling the extension OFF
// from the popup cannot unpatch the page, because the prototypes were
// replaced at document_start and there is no way to retroactively
// recover the page's discarded listeners. Full OFF requires disabling
// the extension at chrome://extensions or reloading the tab.

(function mainWorldPatch() {
  if (window.__rightClickOnWebMainWorldPatched === true) {
    return;
  }
  window.__rightClickOnWebMainWorldPatched = true;

  // Cross-reference: keep this list in sync with
  // RIGHT_CLICK_ON_WEB.blockedEvents in content.js.
  // MAIN world only suppresses events used almost exclusively for
  // blocking; the isolated world handles the rest.
  const BLOCKED_EVENT_NAMES = Object.freeze([
    'contextmenu',
    'selectstart',
    'copy',
    'cut',
    'paste',
    'dragstart'
  ]);

  const blockedEventNameSet = new Set(BLOCKED_EVENT_NAMES);
  const sentinelListener = function noopSentinel() {};

  // ---- 1. Patch EventTarget.prototype.addEventListener ---------------
  //
  // Native addEventListener accepts primitive strings and String wrapper
  // objects, and throws TypeError for anything else. We mirror that
  // shape and replace registrations for the blocking-only subset with
  // a sentinel no-op so the page's preventDefault never runs.
  const originalAddEventListener = EventTarget.prototype.addEventListener;

  function patchedAddEventListener(type, listener, options) {
    if (this instanceof EventTarget) {
      let normalizedType = null;
      if (typeof type === 'string') {
        normalizedType = type;
      } else if (
        typeof type === 'object' &&
        type !== null &&
        Object.prototype.toString.call(type) === '[object String]'
      ) {
        // String wrapper objects (`new String('contextmenu')`) are
        // valid DOMString values. Custom objects with a toString()
        // are NOT -- let the native method throw the spec-defined
        // TypeError for malformed types.
        normalizedType = String(type);
      }
      if (normalizedType !== null && blockedEventNameSet.has(normalizedType)) {
        return Reflect.apply(originalAddEventListener, this, [
          type,
          sentinelListener,
          options
        ]);
      }
    }
    return Reflect.apply(originalAddEventListener, this, [
      type,
      listener,
      options
    ]);
  }

  EventTarget.prototype.addEventListener = patchedAddEventListener;

  // ---- 2. Patch Element.prototype.attachShadow ------------------------
  //
  // Closed shadow roots are unreachable from the outside by design.
  // The only reliable way to regain access is to convert mode at the
  // call site, BEFORE the root is sealed. We build a new init object
  // that inherits from the caller's object (preserving inherited and
  // non-enumerable dictionary members) and override only `mode`.
  const originalAttachShadow = Element.prototype.attachShadow;

  function patchedAttachShadow(init) {
    if (
      init &&
      typeof init === 'object' &&
      init.mode === 'closed'
    ) {
      const normalizedInit = Object.create(init);
      Object.defineProperty(normalizedInit, 'mode', {
        value: 'open',
        enumerable: true,
        configurable: true,
        writable: true
      });
      return Reflect.apply(originalAttachShadow, this, [normalizedInit]);
    }
    return Reflect.apply(originalAttachShadow, this, [init]);
  }

  Element.prototype.attachShadow = patchedAttachShadow;
})();
