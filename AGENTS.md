# Right-click on Web — AGENTS.md

**Generated:** 2026-08-11 (v0.6.2 live-site bypass compatibility)
**Version:** 0.6.2 (manifest.json)
**Repo:** https://github.com/chryth/Right-click-on-Web
**Type:** No-build vanilla Chrome Extension (Manifest V3)

## OVERVIEW

Chrome MV3 extension that unblocks right-click, text selection, copy/drag on restrictive websites. **v0.2.0 introduced a dual-script architecture**: an ISOLATED-world content script for DOM work and a MAIN-world prototype patcher that runs at `document_start` to neutralize page-side blocking listeners and closed Shadow DOMs before any page script can register them. **v0.3.0-alpha adds per-domain control and session-mode activation** via a shared `shared.js` helper module consumed by all three contexts (popup, content script, service worker). **v0.6.0 modernized the extension for current Chrome MV3 trends** with a browser-action context menu, side panel, automatic color scheme, and Firefox capability notice. **v0.6.1 hardens the bypass engine** with MAIN-first injection, related opaque-frame coverage, Firefox background compatibility, removable MAIN-world sentinels, content-script session storage access, and Ultimate CSS inside open Shadow Roots. **v0.6.2 installs reversible ISOLATED-world capture interceptors synchronously at `document_start`**, closing the storage-resolution race exploited by early page capture handlers. No npm, no bundler — loaded directly as unpacked extension.

## STRUCTURE

```
./
├── manifest.json          # MV3 config — content scripts + Chrome/Firefox options/side panel + browser action context menu
├── shared.js              # v0.5.0: shared helpers — domain/session/sync/mode,
│                          #   resolveDomainKey, getHostname, isDomainEnabled,
│                          #   storageGet/Set Promise wrappers + fallback markers. Loaded by content.js,
│                          #   popup.js, and background.js (via importScripts).
├── content.js             # ISOLATED world: DOM cleanup, attribute removal, capture-phase
│                          #   event interceptors, MutationObserver, periodic rescan,
│                          #   shadow-root recursion, stats (`window.__rightClickOnWebStats`)
│                          #   + v0.5.0 Lite/Ultimate CSS mode gating
├── content-main.js        # MAIN world (new in v0.2.0): prototype patches for
│                          #   EventTarget.prototype.addEventListener (sentinel no-op)
│                          #   and Element.prototype.attachShadow (closed → open)
├── background.js          # Service worker — initializes default storage on install
│                          #   + startup; v0.3.0-v0.6.0 storage migrations; v0.6.0
│                          #   context menus, side panel activation, sync fallback rebuild
├── popup.html/css/js      # Toggle UI (Korean, 340px, motorsport red/black/gold)
│                          #   + v0.5.0 domain/session/mode/sync-usage controls
│                          #   + v0.6.0 Firefox notice + side panel entry, dark mode
├── options.html/css/js    # Full settings dashboard — stored-domain ON/OFF/mode/delete management
│                          #   + v0.6.0 side panel hint, dark mode
├── popup-preview.html     # Standalone ASCII popup preview (NOT loaded by extension)
├── icons/                 # icon128.png, icon512.png (referenced from manifest.json `icons` key)
├── assets/screenshots/    # test-page.png — 1280×800 store submission screenshot
├── tests/manual/          # blocked-page.html — manual QA harness with 11 scenarios
│                          #   (8 v0.2.0 + 2 v0.3.0 + Lite/Ultimate); screenshot.png — visual reference
└── docs/                  # store-submission-plan.md, chrome-web-store-requirements.md,
                           #   deployment-manual.md, store-listing.md,
                           #   benchmarking-roadmap.md (single master plan: competitor
                           #   analysis + 4-phase roadmap + v0.3.0 architecture),
                           #   privacy-policy.html, .nojekyll, sessions/
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Dual-script orchestration (load order, world split) | `manifest.json` → `content_scripts[]` | Both run at `document_start`, `all_frames: true`; MAIN `content-main.js` is entry 0 and ISOLATED `["shared.js", "content.js"]` is entry 1. |
| Shared helpers (domain matching, hostname parsing, storage Promise wrappers) | `shared.js` | Loaded via the ISOLATED content-script entry (before content.js), popup.html `<script>` tag, and background.js `importScripts`/Firefox `background.scripts`. Single global `RIGHT_CLICK_ON_WEB_SHARED`. |
| DOM cleanup, attribute removal, capture-phase interceptors, MutationObserver, periodic rescan | `content.js` | ISOLATED world; single global `RIGHT_CLICK_ON_WEB` config object |
| MAIN-world prototype patches (`addEventListener`, `attachShadow`) | `content-main.js` | Runs FIRST at document_start; sentinel listener preserves AbortSignal spec contract |
| `BLOCKED_EVENT_NAMES` ↔ `RIGHT_CLICK_ON_WEB.blockedEvents` sync | cross-reference between `content-main.js:52` and `content.js:14` | Subset split: MAIN blocks only blocking-only events; ISOLATED handles the rest with editable-target exemption |
| Per-domain ON/OFF resolution (v0.3.0) | `content.js` `resolveEnabled()` + `shared.js` `resolveDomainKey()` | Reads merged sync/local domainSettings; walks parent labels until a public-suffix boundary |
| Session-mode activation (v0.3.0) | `content.js` `resolveEnabled()` + `popup.js` `handleSessionToggle()` | Uses `chrome.storage.session`; transient (cleared on browser shutdown); session key format `session:<hostname>` |
| Multi-layer priority resolution (v0.3.0) | `content.js` `resolveEnabled()` + race-condition guard `resolveAndApply()` | session > domain > global; `resolvePromise` coalesces concurrent onChanged fires into one in-flight resolve |
| Extension ON/OFF + per-domain + session toggle UI | `popup.js` + `popup.html` | Three controls: global toggle, domain-card toggle, session button |
| Stored-domain settings dashboard | `options.html` + `options.js` | Global toggle plus all stored domains' ON/OFF, Lite/Ultimate and deletion controls |
| Default storage init + migration | `background.js` | Initializes defaults, migrates local→sync on update, and normalizes legacy boolean domain entries |
| Browser action context menu + side panel activation (v0.6.0) | `background.js` + `manifest.json` | `chrome.contextMenus` entries on the action plus `chrome.sidePanel.open` from popup/menu with options-page fallback |
| Manifest UI/browser metadata | `manifest.json` | `options_ui` opens the shared dashboard; `side_panel.default_path` mirrors it; `contextMenus` + `sidePanel` permissions; Gecko ID declares Firefox packaging metadata; `storage` + `activeTab` + `<all_urls>` remain required |
| Runtime stats for QA | `window.__rightClickOnWebStats` (set in `content.js`) | Counters for attribute removals, event interceptions, overlays, shadow roots, periodic rescans + v0.3.0 `resolveSource` / `matchedDomain` diagnostics + v0.5.0 `mode` (lite/ultimate) |
| Manual QA harness (11 scenarios incl. v0.5.0 mode) | `tests/manual/blocked-page.html` | Korean UI; section 9 = domain, section 10 = session, section 11 = Lite/Ultimate |
| Popup UI preview (browser-open) | `popup-preview.html` | standalone ASCII-art, NOT loaded by extension; reflects sync usage and Lite/Ultimate UI |
| Store submission | `docs/store-submission-plan.md` | step-by-step guide |
| Chrome requirements | `docs/chrome-web-store-requirements.md` | asset specs, policy |
| Deployment manual | `docs/deployment-manual.md` | end-to-end release/deploy procedure |
| Benchmarking analysis & feature roadmap (single source of truth) | `docs/benchmarking-roadmap.md` | Competitor (Ultimate Enable Right Click) gap analysis + 4-phase plan (v0.3.0/v0.4.0/v0.5.0) + v0.3.0 detailed architecture (PSL/subdomain/race-condition/shared module) + 10-scenario QA + execution checklist. v0.3.0-architecture-plan.md was merged into this file on 2026-08-08. |
| Store listing copy (CWS registration form fields) | `docs/store-listing.md` | title/description/category/language/region for submission form |
| Privacy policy page | `docs/privacy-policy.html` | hosted via GitHub Pages from `docs/`; referenced from store submission; v0.4.0 updated to disclose chrome.storage.sync (Chrome Web Store policy) |
| GitHub Pages publishing source | `docs/.nojekyll` | disables Jekyll so `privacy-policy.html` is served verbatim |
| Store submission screenshot (1280×800) | `assets/screenshots/test-page.png` | primary visual asset for Chrome Web Store listing |
| Manual QA screenshot | `tests/manual/screenshot.png` | visual reference for the 8-scenario harness (v0.2.0; v0.3.0 harness needs re-screenshot) |
| Past session notes | `docs/sessions/` | timestamped history (Ymd_HMS_<task>.md) |

## CODE MAP

| Symbol | Kind | Location | Role |
|--------|------|----------|------|
| `RIGHT_CLICK_ON_WEB_SHARED` | const export | `shared.js` (IIFE) | PUBLIC_SUFFIX_BLOCKLIST, MAX_DOMAIN_MATCH_DEPTH, STORAGE_DEFAULTS, SESSION_KEY_PREFIX, sessionKeyFor, getHostname, resolveDomainKey, isDomainEnabled, storageGet/Set/Remove, isSessionStorageAvailable |
| `PUBLIC_SUFFIX_BLOCKLIST` | const Set | `shared.js` | ~40 multi-part TLDs (co.uk, co.kr, com.au, etc.); blocks accidental blanket-match in resolveDomainKey |
| `resolveDomainKey(hostname, settings)` | fn | `shared.js` | Walks parent-domain labels up to MAX_DOMAIN_MATCH_DEPTH=5; returns matched key or null; stops at public-suffix entries |
| `getHostname(href)` | fn | `shared.js` | URL parsing; returns '' for non-http(s) or invalid; used by both popup and content script to gate domain controls |
| `isDomainEnabled(globalEnabled, settings, hostname)` | fn | `shared.js` | Boolean decision: global OFF wins everywhere; otherwise domain entry wins over global |
| `storageGet/Set/Remove(area, ...)` | fn | `shared.js` | Promise wrappers around chrome.storage callback API; surfaces chrome.runtime.lastError as rejection |
| `isSessionStorageAvailable()` | fn | `shared.js` | Defensive runtime check for chrome.storage.session (Chrome 102+); content-script access is enabled by the background worker on install/startup |
| `RIGHT_CLICK_ON_WEB` | const config | `content.js` | blockedAttributes (8), blockedEvents (13), rescanIntervalMs (5000), styleId, markerAttribute |
| `createStats()` | fn | `content.js` | Initializes counters: attributeRemovals, eventInterceptions, overlaysNeutralized, shadowRootsScanned, periodicRescans + v0.3.0 resolveSource, matchedDomain |
| `enableUnlocker()` / `disableUnlocker()` | fn | `content.js` | Idempotent mount/unmount of CSS + listeners + observer + rescan timer |
| `removeBlockingAttributes(root)` | fn | `content.js` | Recursive: walks root, removes blocked attrs, unlocks IDL descriptors, neutralizes overlays, recurses into open shadow roots |
| `clearLockedIdlAttribute(element, attr)` | fn | `content.js` | Bypasses `Object.defineProperty(el, 'oncontextmenu', {configurable:false})` by redefining descriptor + nulling value |
| `neutralizeBlockOverlay(element)` | fn | `content.js` | Sets `pointer-events:none!important` on empty absolute/fixed overlays |
| `addEventInterceptors()` | fn | `content.js` | Registers capture-phase `stopImmediatePropagation` listeners via single `AbortController` signal |
| `startPeriodicRescan()` | fn | `content.js` | 5s `setInterval` → idle-deferred full-DOM rescan; pauses while `visibilityState === 'hidden'` |
| `setEnabled(next, mode)` | fn | `content.js` | Switches ON/OFF and immediately applies Lite/Ultimate CSS changes |
| `resolveEnabled()` | async fn | `content.js` | Reads session > merged domainSettings > global enabled; returns `{enabled, source, hostname, matchedKey, mode}` |
| `resolveAndApply()` | fn | `content.js` (v0.3.0) | Race-condition guard; coalesces concurrent onChanged fires into one in-flight promise via `resolvePromise` singleton |
| `mainWorldPatch()` (IIFE) | fn | `content-main.js:42` | Idempotent sentinel; patches `EventTarget.prototype.addEventListener` + `Element.prototype.attachShadow` |
| `BLOCKED_EVENT_NAMES` | const | `content-main.js:52` | `['contextmenu','selectstart','dragstart']` — subset of `content.js` `blockedEvents`. copy/cut/paste moved out in v0.6.2 to restore web-editor compatibility (Google Docs, Notion, etc.); the ISOLATED capture-phase interceptor already stops blocking-only pages via `stopImmediatePropagation`, and the `isEditableElement` exemption lets real editors' custom paste handlers run. |
| `patchedAddEventListener(type, listener, options)` | fn | `content-main.js:72` | Mirrors native signature (string + String wrapper); replaces blocked types with sentinel no-op listener |
| `patchedAttachShadow(init)` | fn | `content-main.js:114` | `Object.create(init)` + overrides `mode:'closed'` → `mode:'open'` |
| `DEFAULT_SETTINGS` / `STORAGE_DEFAULTS` | const | `background.js` / `shared.js` | `{ enabled: true, domainSettings: {} }` — must stay tri-party-coordinated across popup/content/background |
| `getCurrentHostname()` | async fn | `popup.js` (v0.3.0) | `chrome.tabs.query({active: true, currentWindow: true})` + SHARED.getHostname; requires `activeTab` permission |
| `loadState()` / `render()` | fn | `popup.js` (v0.3.0) | Pulls all storage layers + current hostname; renders global/domain/session UI |
| `handleGlobalToggle()` / `handleDomainToggle()` / `handleSessionToggle()` | fn | `popup.js` (v0.3.0) | Write handlers; each touches a single storage layer; re-render is driven by `chrome.storage.onChanged` listener |

## COMMANDS

```powershell
# Load unpacked: chrome://extensions → Developer mode → Load unpacked → select this folder

# Package for store submission (must include shared.js + BOTH content scripts):
Compress-Archive -Path manifest.json,shared.js,background.js,content.js,content-main.js,popup.html,popup.css,popup.js,icons -DestinationPath "right-click-on-web.zip" -Force
# Exclude from ZIP: .git, .serena, .omo, history, docs, tests, popup-preview.html, README.md, assets/, .opencode/

# GitHub Pages source is docs/ — push to main to publish privacy-policy.html at:
# https://<user>.github.io/<repo>/privacy-policy.html
```

## ANTI-PATTERNS (THIS PROJECT)

- **`host_permissions: ["<all_urls>"]`** — REQUIRED, not a mistake (content script needs it)
- **`activeTab` permission (v0.3.0)** — REQUIRED for popup to read current tab's hostname via `chrome.tabs.query`. Do not remove without also removing the domain-card UI.
- **`contextMenus` + `sidePanel` permissions (v0.6.0)** — REQUIRED for the browser action context menu and the side-panel shortcut. They are no-ops on browsers without the matching API; the popup falls back to `chrome.runtime.openOptionsPage()`.
- **`world: "MAIN"` content script is NOT removable by popup toggle** — prototype patches apply at `document_start` and cannot be undone mid-page-life. Full OFF requires extension disable + tab reload (or refresh).
- **OFF mode on `content.js`** — removes injected CSS / event listeners / observer / rescan timer but does NOT restore inline blocking attributes removed while ON (by design; never restores page state it didn't observe)
- **No remote code loading, no telemetry, no network calls** — Chrome Web Store policy violation
- **Do not consolidate the two content scripts into one** — they MUST be separate entries in `manifest.json` with different `world` values. Merging them breaks the ISOLATED/MAIN isolation boundary that protects the page's prototype chain.
- **Do not duplicate shared helpers into each script** — `shared.js` is the single source of truth for `resolveDomainKey`/`getHostname`/`isDomainEnabled`/`storageGet`/`storageSet`. Drift between popup, content, and background is a guaranteed bug source.

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
- **Periodic rescan (v0.2.0)** — `startPeriodicRescan` runs every 5s via `setInterval`, idle-deferred via `requestIdleCallback` (1s `setTimeout` fallback). Paused while tab is hidden (`document.visibilityState === 'hidden'`). Catches mutations that `MutationObserver` misses on detached subtrees.
- **Synchronous capture guard (v0.6.2)** — `content.js` installs its reversible capture interceptors before awaiting storage. This preempts early page capture listeners and inline `oncontextmenu` handlers; an OFF resolution aborts the guard through `disableUnlocker()`.
- **Editable elements are preserved** — `isEditableElement()` skips `input/textarea/select/[contenteditable]` so user typing/right-click-paste in form fields still works as native (ISOLATED capture-phase interceptor only).
- **Shared module (v0.3.0)** — `shared.js` is loaded by `content.js` (via manifest content_scripts[0]), `popup.js` (via popup.html script tag), and `background.js` (via `importScripts`). All three contexts see the same `RIGHT_CLICK_ON_WEB_SHARED` global. This avoids drift in `resolveDomainKey` / `getHostname` / `isDomainEnabled` semantics.
- **Resolution priority (v0.3.0-v0.4.0)** — `session > domain > global`. chrome.storage.session (transient) > merged sync/local domainSettings[hostname] (per-domain entry, with parent-label fallback) > merged sync/local enabled (global). Sync normally wins over local, except a local quota-fallback marker preserves the latest local user choice until a sync write succeeds. Popup and content script MUST agree.
- **Public suffix blocklist (v0.3.0)** — `resolveDomainKey` stops at curated `PUBLIC_SUFFIX_BLOCKLIST` entries (~40 multi-part TLDs like co.uk, co.kr, com.au), so accidental `"co.uk"` or `"uk"` entries cannot blanket-affect a suffix family. Not a full PSL — extend this set rather than adding a runtime PSL library.
- **Domain matching depth cap (v0.3.0)** — `MAX_DOMAIN_MATCH_DEPTH = 5` caps recursive label walking. Real hostnames rarely exceed 5 labels; the cap prevents runaway recursion on malformed inputs.
- **Hostname guard (v0.3.0)** — `getHostname()` returns '' for non-http(s) schemes (chrome://, about:blank, file://, extension pages). Popup and content script both treat empty hostname as "global only" — no domainSettings or session key lookup.
- **Race-condition guard (v0.3.0)** — `resolveAndApply()` is the only entry point for re-resolution. It coalesces concurrent `chrome.storage.onChanged` fires into a single in-flight promise via the `resolvePromise` module-level singleton. Callers that fire while a resolve is in flight receive the same promise.
- **Storage convention** — `popup.js` writes, `background.js` initializes, `content.js` reads + listens for `onChanged`. Pre-v0.3.0 storage shape (`{enabled: true}`) is auto-merged on install — `domainSettings` is added with default `{}`. User's prior `enabled` value is preserved.
- **Sync storage (v0.4.0)** — All settings writes go through `SHARED.safeSyncSet()` which tries `chrome.storage.sync` first and falls back to `chrome.storage.local` on `QuotaExceededError`. Reads use `SHARED.resolveSettings()` to merge sync + local in parallel, with sync winning on conflict. Sync quota (100KB / 8KB per item / 512 items) is surfaced via popup "동기화 사용량" indicator that warns at 80%.
- **Migration timing (v0.4.0)** — `migrateLocalToSync()` only fires on `onInstalled` with `reason='update'` (not on `onStartup`). If sync already has data, the local migration is skipped to avoid overwriting newer cross-device state.
- **Lite / Ultimate mode (v0.5.0)** — `domainSettings[hostname]` is `{ enabled, mode }` where `mode ∈ { 'lite', 'ultimate' }`. Ultimate (default) applies all unblockers including CSS `user-select` override. Lite applies only the MAIN-world prototype patches and capture-phase interceptors — the page's `user-select: none` styles remain in effect. MAIN world patches run at `document_start` and cannot be undone, so they apply in BOTH modes; the Lite/Ultimate difference is only the ISOLATED-world CSS injection.
- **Schema migration (v0.5.0)** — `domainSettings` entries change from boolean to `{ enabled, mode }`. `migrateDomainSettings()` in `background.js` runs on `onInstalled(reason='update')` to normalize all entries via `parseDomainSetting()`. `parseDomainSetting()` also accepts the legacy boolean shape for defensive reads in `isDomainEnabled()` and `resolveMode()`.
- **Idempotent enable/disable (content.js)** — `enableUnlocker()` short-circuits via `isActive` flag; `disableUnlocker()` only tears down listeners/observer/CSS/timer, NOT the attributes removed while ON (per anti-pattern note above).
- **Git excludes** — `.omo/` (OMO run state), `.serena/` (memories + project.yml), `.git/`, `history/` are tool/runtime byproducts. `.codegraph/` exists locally (SQLite DB) but is NOT a project file; add to `.gitignore` if not already excluded.
- **LSP/codegraph unavailable for this project** — typescript LSP active client is rooted at `C:\NEW PRG\Open Sync`, not this repo. Rely on `read` + manual inspection for code understanding.
- **GitHub Pages source = `docs/`** — `docs/.nojekyll` disables Jekyll processing so `privacy-policy.html` is served verbatim (correct `text/html` Content-Type). Any new `.html` under `docs/` is published automatically on push to main.
- **Store submission flow is documented in-repo, not in this file** — read `docs/store-submission-plan.md` for end-to-end CWS submission procedure; this AGENTS.md only indexes the artifacts.
- **Korean-first UI** — popup labels, test page copy, and preview are Korean; do NOT translate without explicit request. README is intentionally Korean.
