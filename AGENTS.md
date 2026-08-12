# Right-click on Web — AGENTS.md

**Generated:** 2026-08-12 (v0.8.0 local WASM OCR & screen capture)
**Version:** 0.8.0 (manifest.json)
**Repo:** https://github.com/chryth/Right-click-on-Web
**Type:** No-build vanilla Chrome Extension (Manifest V3)

## OVERVIEW

Chrome MV3 extension that unblocks right-click, text selection, copy/drag on restrictive websites. **v0.2.0 introduced a dual-script architecture**: an ISOLATED-world content script for DOM work and a MAIN-world prototype patcher that runs at `document_start` to neutralize page-side blocking listeners and closed Shadow DOMs before any page script can register them. **v0.3.0-alpha adds per-domain control and session-mode activation** via a shared `shared.js` helper module consumed by all three contexts (popup, content script, service worker). **v0.6.0 modernized the extension for current Chrome MV3 trends** with a browser-action context menu, side panel, automatic color scheme, and Firefox capability notice. **v0.6.1 hardens the bypass engine** with MAIN-first injection, related opaque-frame coverage, Firefox background compatibility, removable MAIN-world sentinels, content-script session storage access, and Ultimate CSS inside open Shadow Roots. **v0.6.2 installs reversible ISOLATED-world capture interceptors synchronously at `document_start`**, closing the storage-resolution race exploited by early page capture handlers. **v0.6.3 limits mouse interception to the secondary button and preserves normal left/middle-click and touch input chains.** **v0.7.0 reinforces copy reliability**: restores `::selection`/`::-moz-selection` visibility, neutralizes `cursor: default` selection disguise & `@media print` hide tricks, intercepts `keydown` copy shortcuts (`Ctrl+C`, `Ctrl+A`, `Ctrl+X`, `Ctrl+Insert`) on non-editable targets, and clarifies UI mode wording ("블록 지정 활성화 (CSS)"). **v0.8.0 introduces 100% offline local WASM OCR text extraction**: interactive screen area crop overlay (`crop-overlay.js/css`), offscreen DOM document hosting Tesseract.js (`offscreen.html/js`), local Korean/English language models (`langs/`), and `Alt+Shift+S` shortcut trigger. No npm, no bundler — loaded directly as unpacked extension.

## STRUCTURE

```
./
├── manifest.json          # MV3 config — content scripts + Chrome/Firefox options/side panel + OCR offscreen/commands
├── shared.js              # v0.5.0: shared helpers — domain/session/sync/mode,
│                          #   resolveDomainKey, getHostname, isDomainEnabled,
│                          #   storageGet/Set Promise wrappers + fallback markers. Loaded by content.js,
│                          #   popup.js, and background.js (via importScripts).
├── content.js             # ISOLATED world: DOM cleanup, attribute removal, capture-phase
│                          #   event interceptors, MutationObserver, periodic rescan,
│                          #   shadow-root recursion, stats (`window.__rightClickOnWebStats`)
├── content-main.js        # MAIN world (new in v0.2.0): prototype patches for
│                          #   EventTarget.prototype.addEventListener (sentinel no-op)
│                          #   and Element.prototype.attachShadow (closed → open)
├── crop-overlay.js/css    # v0.8.0: Screen area crop overlay for interactive OCR selection
├── offscreen.html/js      # v0.8.0: Offscreen document running offline Tesseract.js WASM engine
├── lib/                   # v0.8.0: Tesseract.js core, worker, and SIMD/LSTM WASM binaries
├── langs/                 # v0.8.0: Korean (kor) and English (eng) offline traineddata
├── background.js          # Service worker — storage defaults/migrations, context menus,
│                          #   side panel, commands, and OCR bridge (captureVisibleTab -> offscreen)
├── popup.html/css/js      # Toggle UI (Korean, 340px, motorsport red/black/gold)
│                          #   + v0.5.0 domain/session/mode/sync-usage controls
│                          #   + v0.8.0 OCR trigger button + shortcut hint
├── options.html/css/js    # Full settings dashboard — stored-domain ON/OFF/mode/delete management
├── popup-preview.html     # Standalone ASCII popup preview (NOT loaded by extension)
├── icons/                 # icon128.png, icon512.png (referenced from manifest.json `icons` key)
├── assets/screenshots/    # test-page.png — 1280×800 store submission screenshot
├── tests/manual/          # blocked-page.html — manual QA harness with 15 scenarios
│                          #   (8 v0.2.0 + 2 v0.3.0 + Lite/Ultimate + v0.7.0/v0.8.0); screenshot.png
└── docs/                  # store-submission-plan.md, chrome-web-store-requirements.md,
                           #   deployment-manual.md, store-listing.md,
                           #   benchmarking-roadmap.md, privacy-policy.html, .nojekyll, sessions/
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| OCR interactive selection & overlay UI | `crop-overlay.js` + `crop-overlay.css` | Injected on top-level frame only (`all_frames: false`); provides drag crosshair, crop-box, tip, loading spinner, and toast notifications |
| Offline WASM OCR engine & canvas crop | `offscreen.html` + `offscreen.js` | Hosts Tesseract.js in offscreen DOM environment; loads local WASM core (`lib/`) and language data (`langs/`); returns extracted text |
| Dual-script orchestration (load order, world split) | `manifest.json` → `content_scripts[]` | MAIN `content-main.js` (entry 0, `all_frames: true`), ISOLATED `["shared.js", "content.js"]` (entry 1, `all_frames: true`), and ISOLATED `["crop-overlay.js"]` (entry 2, `all_frames: false`). |
| Shared helpers (domain matching, hostname parsing, storage Promise wrappers) | `shared.js` | Loaded via the ISOLATED content-script entry (before content.js), popup.html `<script>` tag, and background.js `importScripts`/Firefox `background.scripts`. Single global `RIGHT_CLICK_ON_WEB_SHARED`. |
| DOM cleanup, attribute removal, capture-phase interceptors, MutationObserver, periodic rescan | `content.js` | ISOLATED world; single global `RIGHT_CLICK_ON_WEB` config object |
| MAIN-world prototype patches (`addEventListener`, `attachShadow`) | `content-main.js` | Runs FIRST at document_start; sentinel listener preserves AbortSignal spec contract |
| `BLOCKED_EVENT_NAMES` ↔ `RIGHT_CLICK_ON_WEB.blockedEvents` sync | cross-reference between `content-main.js:52` and `content.js:14` | Subset split: MAIN blocks only blocking-only events; ISOLATED handles the rest with editable-target exemption |
| Per-domain ON/OFF resolution (v0.3.0) | `content.js` `resolveEnabled()` + `shared.js` `resolveDomainKey()` | Reads merged sync/local domainSettings; walks parent labels until a public-suffix boundary |
| Session-mode activation (v0.3.0) | `content.js` `resolveEnabled()` + `popup.js` `handleSessionToggle()` | Uses `chrome.storage.session`; transient (cleared on browser shutdown); session key format `session:<hostname>` |
| Multi-layer priority resolution (v0.3.0) | `content.js` `resolveEnabled()` + race-condition guard `resolveAndApply()` | session > domain > global; `resolvePromise` coalesces concurrent onChanged fires into one in-flight resolve |
| Extension ON/OFF + per-domain + session toggle UI | `popup.js` + `popup.html` | Three controls: global toggle, domain-card toggle, session button + OCR capture button |
| Stored-domain settings dashboard | `options.html` + `options.js` | Global toggle plus all stored domains' ON/OFF, Lite/Ultimate and deletion controls |
| Default storage init + migration | `background.js` | Initializes defaults, migrates local→sync on update, and normalizes legacy boolean domain entries |
| Background OCR bridge + Context menu + side panel (v0.6.0-v0.8.0) | `background.js` | `captureVisibleTab` + offscreen worker delegation; `chrome.contextMenus` + `chrome.commands` shortcut (`Alt+Shift+S`) |
| Manifest UI/browser metadata | `manifest.json` | `options_ui` opens shared dashboard; `side_panel.default_path` mirrors it; `offscreen` + `commands` + `content_security_policy` declaring `wasm-unsafe-eval` |
| Runtime stats for QA | `window.__rightClickOnWebStats` (set in `content.js`) | Counters for attribute removals, event interceptions, overlays, shadow roots, periodic rescans + v0.3.0 `resolveSource` / `matchedDomain` diagnostics + v0.5.0 `mode` (lite/ultimate) |
| Manual QA harness (15 scenarios) | `tests/manual/blocked-page.html` | Korean UI; section 13 = `::selection`, section 14 = `Ctrl+C`, section 15 = Canvas/Image Local OCR |
| Popup UI preview (browser-open) | `popup-preview.html` | standalone ASCII-art, NOT loaded by extension; reflects sync usage and Lite/Ultimate UI |
| Store submission | `docs/store-submission-plan.md` | step-by-step guide |
| Chrome requirements | `docs/chrome-web-store-requirements.md` | asset specs, policy |
| Deployment manual | `docs/deployment-manual.md` | end-to-end release/deploy procedure |
| Benchmarking analysis & feature roadmap (single source of truth) | `docs/benchmarking-roadmap.md` | Competitor (Ultimate Enable Right Click + Text From PRO) gap analysis + 4-phase plan + architecture |
| Store listing copy (CWS registration form fields) | `docs/store-listing.md` | title/description/category/language/region for submission form |
| Privacy policy page | `docs/privacy-policy.html` | hosted via GitHub Pages from `docs/`; referenced from store submission; v0.4.0 updated to disclose chrome.storage.sync (Chrome Web Store policy) |
| GitHub Pages publishing source | `docs/.nojekyll` | disables Jekyll so `privacy-policy.html` is served verbatim |
| Store submission screenshot (1280×800) | `assets/screenshots/test-page.png` | primary visual asset for Chrome Web Store listing |
| Manual QA screenshot | `tests/manual/screenshot.png` | visual reference for the harness |
| Past session notes | `docs/sessions/` | timestamped history (Ymd_HMS_<task>.md) |

## COMMANDS

```powershell
# Load unpacked: chrome://extensions → Developer mode → Load unpacked → select this folder

# Package for store submission (v0.8.0 with local WASM OCR engine & language models):
Compress-Archive -Path manifest.json,shared.js,background.js,content.js,content-main.js,crop-overlay.js,crop-overlay.css,offscreen.html,offscreen.js,popup.html,popup.css,popup.js,options.html,options.css,options.js,lib,langs,icons -DestinationPath "right-click-on-web-v0.8.0.zip" -Force
# Exclude from ZIP: .git, .serena, .omo, history, docs, tests, popup-preview.html, README.md, assets/, .opencode/
```

## ANTI-PATTERNS (THIS PROJECT)
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

- **Dual-script contract (v0.2.0)** — `content-main.js` MUST run before `content.js` on the same frame. Both declare `run_at: "document_start"`, and Chrome guarantees manifest-declaration order. The MAIN-world patch neutralizes blocking listeners at the prototype level; the ISOLATED-world script handles DOM cleanup and capture-phase interception for events with legitimate non-blocking uses (`dragover`, `drop`, `mousedown`, `mouseup`).
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
