# Right-click on Web — AGENTS.md

**Generated:** 2026-07-31 (regenerated via /init-deep)
**Commit:** e9a0e51 / main
**Version:** 0.2.0 (manifest.json)
**Type:** No-build vanilla Chrome Extension (Manifest V3)

## OVERVIEW

Chrome MV3 extension that unblocks right-click, text selection, copy/drag on restrictive websites. **v0.2.0 introduces a dual-script architecture**: an ISOLATED-world content script for DOM work and a MAIN-world prototype patcher that runs at `document_start` to neutralize page-side blocking listeners and closed Shadow DOMs before any page script can register them. No npm, no bundler — loaded directly as unpacked extension.

## STRUCTURE

```
./
├── manifest.json          # MV3 config — declares TWO content_scripts (isolated + MAIN)
├── content.js             # ISOLATED world: DOM cleanup, attribute removal, capture-phase
│                          #   event interceptors, MutationObserver, periodic rescan,
│                          #   shadow-root recursion, stats (`window.__rightClickOnWebStats`)
├── content-main.js        # MAIN world (new in v0.2.0): prototype patches for
│                          #   EventTarget.prototype.addEventListener (sentinel no-op)
│                          #   and Element.prototype.attachShadow (closed → open)
├── background.js          # Service worker — initializes default storage on install
├── popup.html/css/js      # Toggle UI (Korean, 340px, motorsport red/black/gold)
├── popup-preview.html     # Standalone ASCII popup preview (NOT loaded by extension)
├── icons/                 # icon128.png, icon512.png
├── tests/manual/          # blocked-page.html — manual QA harness with 8 scenarios
└── docs/                  # store-submission-plan.md, chrome-web-store-requirements.md,
                           # deployment-manual.md, sessions/
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Dual-script orchestration (load order, world split) | `manifest.json` → `content_scripts[]` | Both run at `document_start`, `all_frames: true` |
| DOM cleanup, attribute removal, capture-phase interceptors, MutationObserver, periodic rescan | `content.js` | ISOLATED world; single global `RIGHT_CLICK_ON_WEB` config object |
| MAIN-world prototype patches (`addEventListener`, `attachShadow`) | `content-main.js` | Runs FIRST at document_start; sentinel listener preserves AbortSignal spec contract |
| `BLOCKED_EVENT_NAMES` ↔ `RIGHT_CLICK_ON_WEB.blockedEvents` sync | cross-reference between `content-main.js:52` and `content.js:14` | Subset split: MAIN blocks only blocking-only events; ISOLATED handles the rest with editable-target exemption |
| Extension ON/OFF toggle | `popup.js` + `popup.html` | `chrome.storage.local` get/set/render |
| Default storage init | `background.js` | `chrome.runtime.onInstalled` |
| Manifest permissions | `manifest.json` | `storage` + `<all_urls>` host_permissions |
| Runtime stats for QA | `window.__rightClickOnWebStats` (set in `content.js`) | Counters for attribute removals, event interceptions, overlays, shadow roots, periodic rescans |
| Manual QA harness (8 scenarios incl. v0.2.0 stats) | `tests/manual/blocked-page.html` | Korean UI, dynamic blocking-element generator |
| Popup UI preview (browser-open) | `popup-preview.html` | standalone ASCII-art, NOT loaded by extension |
| Store submission | `docs/store-submission-plan.md` | step-by-step guide |
| Chrome requirements | `docs/chrome-web-store-requirements.md` | asset specs, policy |
| Deployment manual | `docs/deployment-manual.md` | end-to-end release/deploy procedure |
| Past session notes | `docs/sessions/` | timestamped history |

## CODE MAP

| Symbol | Kind | Location | Role |
|--------|------|----------|------|
| `RIGHT_CLICK_ON_WEB` | const config | `content.js:1` | blockedAttributes (8), blockedEvents (13), rescanIntervalMs (2000), styleId, markerAttribute |
| `createStats()` | fn | `content.js:44` | Initializes counters: attributeRemovals, eventInterceptions, overlaysNeutralized, shadowRootsScanned, periodicRescans |
| `enableUnlocker()` / `disableUnlocker()` | fn | `content.js:381` / `content.js:396` | Idempotent mount/unmount of CSS + listeners + observer + rescan timer |
| `removeBlockingAttributes(root)` | fn | `content.js:249` | Recursive: walks root, removes blocked attrs, unlocks IDL descriptors, neutralizes overlays, recurses into open shadow roots |
| `clearLockedIdlAttribute(element, attr)` | fn | `content.js:176` | Bypasses `Object.defineProperty(el, 'oncontextmenu', {configurable:false})` by redefining descriptor + nulling value |
| `neutralizeBlockOverlay(element)` | fn | `content.js:131` | Sets `pointer-events:none!important` on empty absolute/fixed overlays |
| `addEventInterceptors()` | fn | `content.js:337` | Registers capture-phase `stopImmediatePropagation` listeners via single `AbortController` signal |
| `startPeriodicRescan()` | fn | `content.js:361` | 2s `setInterval` → idle-deferred full-DOM rescan; pauses while `visibilityState === 'hidden'` |
| `setEnabled(next)` | fn | `content.js:416` | Switches ON/OFF in response to `chrome.storage.onChanged` |
| `mainWorldPatch()` (IIFE) | fn | `content-main.js:42` | Idempotent sentinel; patches `EventTarget.prototype.addEventListener` + `Element.prototype.attachShadow` |
| `BLOCKED_EVENT_NAMES` | const | `content-main.js:52` | `['contextmenu','selectstart','copy','cut','paste','dragstart']` — subset of `content.js` `blockedEvents` |
| `patchedAddEventListener(type, listener, options)` | fn | `content-main.js:72` | Mirrors native signature (string + String wrapper); replaces blocked types with sentinel no-op listener |
| `patchedAttachShadow(init)` | fn | `content-main.js:114` | `Object.create(init)` + overrides `mode:'closed'` → `mode:'open'` |
| `DEFAULT_SETTINGS` / `STORAGE_DEFAULTS` | const | `background.js:1` / `popup.js:1` | `{ enabled: true }` — must stay tri-party-coordinated with `content.js` storage read |

## COMMANDS

```powershell
# Load unpacked: chrome://extensions → Developer mode → Load unpacked → select this folder
# Package for store submission (must include BOTH content scripts):
Compress-Archive -Path manifest.json,background.js,content.js,content-main.js,popup.html,popup.css,popup.js,icons -DestinationPath "right-click-on-web.zip" -Force
# Exclude from ZIP: .git, .serena, .omo, history, docs, tests, popup-preview.html, README.md
```

## ANTI-PATTERNS (THIS PROJECT)

- **`host_permissions: ["<all_urls>"]`** — REQUIRED, not a mistake (content script needs it)
- **No `activeTab` or `scripting` permissions** — unnecessary for this MVP
- **`world: "MAIN"` content script is NOT removable by popup toggle** — prototype patches apply at `document_start` and cannot be undone mid-page-life. Full OFF requires extension disable + tab reload (or refresh).
- **OFF mode on `content.js`** — removes injected CSS / event listeners / observer / rescan timer but does NOT restore inline blocking attributes removed while ON (by design; never restores page state it didn't observe)
- **No remote code loading, no telemetry, no network calls** — Chrome Web Store policy violation
- **Do not consolidate the two content scripts into one** — they MUST be separate entries in `manifest.json` with different `world` values. Merging them breaks the ISOLATED/MAIN isolation boundary that protects the page's prototype chain.

## UNIQUE STYLES

- Korean language UI in popup, manual test page, and popup preview (English title only)
- Motorsports aesthetic: Rosso Corsa red (`#e10600` via CSS var `--rosso-corsa`), carbon black, gold accent (`#c8a45d`)
- No official brand imagery — only color inspiration
- Popup preview via `popup-preview.html` (ASCII-art standalone, not loaded by extension)
- IIFE wrapper for the MAIN-world patcher (`mainWorldPatch()`) with a window-level guard (`__rightClickOnWebMainWorldPatched`) for idempotent re-injection

## LIMITATIONS

Cannot bypass:
- DRM / protected media (Netflix, etc.)
- Image / canvas-rendered text (no DOM text node exists to select)
- Server-side withheld text
- Closed Shadow DOMs created in cross-origin iframes (MAIN-world patch is per-frame; other-origin frame's prototypes are sealed before patch can run)
- Sandboxed iframes without `allow-scripts` (JS blocked, prototype patches cannot apply)

## NOTES

- **Dual-script contract (v0.2.0)** — `content-main.js` MUST run before `content.js` on the same frame. Both declare `run_at: "document_start"`, and Chrome guarantees manifest-declaration order. The MAIN-world patch neutralizes blocking listeners at the prototype level; the ISOLATED-world script handles DOM cleanup and capture-phase interception for events with legitimate non-blocking uses (`dragover`, `drop`, `mousedown`, `mouseup`, `touchstart/end/move`).
- **MAIN world sentinel rationale (v0.2.0)** — `content-main.js` registers a no-op listener (`sentinelListener`) instead of silently returning. This preserves the AbortSignal spec contract: pages using `addEventListener('contextmenu', handler, {signal})` can later `controller.abort()` or `removeEventListener` without throwing.
- **Closed → open Shadow DOM conversion (v0.2.0)** — `patchedAttachShadow` builds `Object.create(init)` to preserve inherited + non-enumerable members of the caller's init dictionary, then overrides only `mode`. Original page-side references to the shadow root remain intact.
- **IDL property unlock (v0.2.0)** — `clearLockedIdlAttribute` handles pages that lock `oncontextmenu` via `Object.defineProperty(el, 'oncontextmenu', {configurable:false})`. It reads the descriptor, redefines it with `configurable:true`, then nulls the value.
- **Periodic rescan (v0.2.0)** — `startPeriodicRescan` runs every 2s via `setInterval`, idle-deferred via `requestIdleCallback` (1s `setTimeout` fallback). Paused while tab is hidden (`document.visibilityState === 'hidden'`). Catches mutations that `MutationObserver` misses on detached subtrees.
- **Editable elements are preserved** — `isEditableElement()` skips `input/textarea/select/[contenteditable]` so user typing/right-click-paste in form fields still works as native (ISOLATED capture-phase interceptor only).
- **Storage convention** — all three layers (`popup.js`, `background.js`, `content.js`) use the same `{ enabled: true }` shape; treat changes as tri-party coordinated. `popup.js` writes, `background.js` initializes, `content.js` reads + listens for `onChanged`.
- **Idempotent enable/disable (content.js)** — `enableUnlocker()` short-circuits via `isActive` flag; `disableUnlocker()` only tears down listeners/observer/CSS/timer, NOT the attributes removed while ON (per anti-pattern note above).
- **Git excludes** — `.omo/` (OMO run state), `.serena/` (memories + project.yml), `.git/`, `history/` are tool/runtime byproducts. `.codegraph/` exists locally (SQLite DB) but is NOT a project file; add to `.gitignore` if not already excluded.
- **LSP/codegraph unavailable for this project** — typescript LSP active client is rooted at `C:\NEW PRG\Open Sync`, not this repo. Rely on `read` + manual inspection for code understanding.
- **Korean-first UI** — popup labels, test page copy, and preview are Korean; do NOT translate without explicit request. README is intentionally Korean.