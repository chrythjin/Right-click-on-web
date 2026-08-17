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
// recover the page's discarded listeners. Reloading the tab while the
// extension remains enabled re-runs this script at document_start and
// re-installs the same patches. Complete restoration requires disabling
// the extension at chrome://extensions AND reloading the tab.
//
// Design constraint (task 2.3): this script MUST NOT read chrome.storage
// or any per-domain setting before installing its prototype patches.
// The entire value of the MAIN-world patch is that it runs synchronously
// at document_start, BEFORE any page script can register blocking
// listeners. An async storage read would surrender that preemptive
// guarantee — the page would have already installed its handlers by
// the time the read resolved. The ISOLATED-world content.js is the only
// context that reads storage and gates ISOLATED-only behavior; MAIN
// patches are always-on and cannot be conditionally installed.
//
// UI contract (task 2.3): the popup MUST NOT promise that toggling OFF
// or switching a profile immediately removes already-installed MAIN-
// world prototype patches, nor that an ordinary tab reload alone
// removes them. The popup must communicate that MAIN patches persist
// for the page's lifetime and re-appear after reload while the
// extension remains enabled; complete restoration requires disabling
// the extension and reloading the tab. The ISOLATED-world teardown
// (CSS, capture interceptors, observer, rescan timer) is immediate.

(function mainWorldPatch() {
  if (window.__rightClickOnWebMainWorldPatched === true) {
    return;
  }
  window.__rightClickOnWebMainWorldPatched = true;

  // Cross-reference: keep this list in sync with
  // RIGHT_CLICK_ON_WEB.blockedEvents in content.js.
  // MAIN world only suppresses events used almost exclusively for
  // blocking; the isolated world handles the rest.
  //
  // copy/cut/paste are intentionally excluded because the MAIN-world
  // patch cannot exempt editable elements before a target is bound.
  // The isolated-world capture interceptor handles blocking-only pages
  // while preserving legitimate editor clipboard handlers.
  const BLOCKED_EVENT_NAMES = Object.freeze([
    'contextmenu',
    'selectstart',
    'dragstart'
  ]);

  const blockedEventNameSet = new Set(BLOCKED_EVENT_NAMES);
  const blockedListenerMaps = new WeakMap();

  // ---- 1. Patch EventTarget.prototype.addEventListener ---------------
  //
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  const originalRemoveEventListener = EventTarget.prototype.removeEventListener;

  function isEditableTarget(target) {
    return target instanceof Element && (
      target.isContentEditable ||
      Boolean(target.closest('input, textarea, select'))
    );
  }

  function stopInlineBlocker(event) {
    if (isEditableTarget(event.target)) {
      return;
    }
    event.stopImmediatePropagation();
  }

  // Inline `oncontextmenu="return false"` handlers are not registered
  // through addEventListener, and an ISOLATED-world capture listener does
  // not reliably suppress their MAIN-world IDL handler in Chromium. Use
  // the native method captured before patching so this guard itself is not
  // replaced by the sentinel path below.
  for (const eventName of BLOCKED_EVENT_NAMES) {
    Reflect.apply(originalAddEventListener, document, [
      eventName,
      stopInlineBlocker,
      { capture: true, passive: false }
    ]);
  }

  function normalizeEventType(type) {
    if (typeof type === 'symbol') {
      return null;
    }
    try {
      return String(type);
    } catch (_) {
      return null;
    }
  }

  function replacementFor(target, eventName, listener, create) {
    if ((typeof listener !== 'function' && typeof listener !== 'object') || listener === null) {
      return null;
    }

    let targetMap = blockedListenerMaps.get(target);
    if (!targetMap) {
      if (!create) return null;
      targetMap = new Map();
      blockedListenerMaps.set(target, targetMap);
    }

    let listenerMap = targetMap.get(eventName);
    if (!listenerMap) {
      if (!create) return null;
      listenerMap = new WeakMap();
      targetMap.set(eventName, listenerMap);
    }

    let replacement = listenerMap.get(listener);
    if (!replacement && create) {
      replacement = function noopSentinel() {};
      listenerMap.set(listener, replacement);
    }
    return replacement || null;
  }

  function patchedAddEventListener(type, listener, options) {
    if (this instanceof EventTarget) {
      const normalizedType = normalizeEventType(type);
      if (normalizedType !== null && blockedEventNameSet.has(normalizedType)) {
        const replacement = replacementFor(
          this,
          normalizedType,
          listener,
          true
        );
        if (!replacement) {
          return Reflect.apply(originalAddEventListener, this, [type, listener, options]);
        }
        return Reflect.apply(originalAddEventListener, this, [
          normalizedType,
          replacement,
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

  function patchedRemoveEventListener(type, listener, options) {
    if (this instanceof EventTarget) {
      const normalizedType = normalizeEventType(type);
      if (normalizedType !== null && blockedEventNameSet.has(normalizedType)) {
        const replacement = replacementFor(
          this,
          normalizedType,
          listener,
          false
        );
        if (replacement) {
          return Reflect.apply(originalRemoveEventListener, this, [
            normalizedType,
            replacement,
            options
          ]);
        }
      }
    }
    return Reflect.apply(originalRemoveEventListener, this, [
      type,
      listener,
      options
    ]);
  }

  EventTarget.prototype.removeEventListener = patchedRemoveEventListener;

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
