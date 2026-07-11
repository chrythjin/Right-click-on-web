# Right-click on Web — AGENTS.md

**Generated:** 2026-07-12 (regenerated via /init-deep)
**Commit:** 4fa538a / main
**Version:** 0.1.0 (manifest.json)
**Type:** No-build vanilla Chrome Extension (Manifest V3)

## OVERVIEW

Chrome MV3 extension that unblocks right-click, text selection, copy/drag on restrictive websites. No npm, no bundler — loaded directly as unpacked extension.

## STRUCTURE

```
./
├── manifest.json          # MV3 config — action/popup, content_scripts, host_permissions
├── content.js             # Core logic — event interceptors, style injection, DOM observer
├── background.js          # Service worker — sets default storage on install
├── popup.html/css/js      # Toggle UI (Korean, 340px, red/black/gold)
├── popup-preview.html     # Standalone popup preview (NOT loaded by extension)
├── icons/                 # icon128.png, icon512.png
├── tests/manual/          # blocked-page.html — manual QA page (Korean UI)
└── docs/                  # store-submission-plan.md, chrome-web-store-requirements.md,
                           # deployment-manual.md, sessions/
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Core blocking logic | `content.js` | eventController, observer, removeBlockingAttributes |
| Extension ON/OFF toggle | `popup.js` + `popup.html` | storage.get/set enabled flag |
| Default storage init | `background.js` | onInstalled listener |
| Manifest permissions | `manifest.json` | storage + <all_urls> host_permissions |
| Manual test | `tests/manual/blocked-page.html` | Korean UI, dynamic blocking element |
| Popup UI preview (browser-open) | `popup-preview.html` | standalone, NOT loaded by extension |
| Store submission | `docs/store-submission-plan.md` | step-by-step guide |
| Chrome requirements | `docs/chrome-web-store-requirements.md` | asset specs, policy |
| Deployment manual | `docs/deployment-manual.md` | end-to-end release/deploy procedure |
| Past session notes | `docs/sessions/` | timestamped history |

## COMMANDS

```powershell
# Load unpacked: chrome://extensions → Developer mode → Load unpacked → select this folder
# Package for store submission:
Compress-Archive -Path manifest.json,background.js,content.js,popup.html,popup.css,popup.js,icons -DestinationPath "right-click-on-web.zip" -Force
# Exclude from ZIP: .git, .serena, docs, tests, popup-preview.html, README.md
```

## ANTI-PATTERNS (THIS PROJECT)

- **host_permissions: ["<all_urls>"]** — REQUIRED, not a mistake (content script needs it)
- **No activeTab or scripting permissions** — unnecessary for this MVP
- **OFF mode** — removes injected CSS/listeners/observer but does NOT restore inline blocking attributes removed while ON (by design)
- **No remote code loading, no telemetry, no network calls** — policy violation

## UNIQUE STYLES

- Korean language UI in popup and test page
- Motorsports aesthetic: Rosso Corsa red (#DC0000), carbon black, gold accent
- No official brand imagery — only color inspiration
- Popup preview via `popup-preview.html` (standalone, not loaded by extension)

## LIMITATIONS

Cannot bypass:
- DRM/protected media
- Image/canvas rendered text
- Server-side withheld text
- Closed Shadow DOM
- Heavily sandboxed iframes

## NOTES

- **Edit targets inline blocking attributes only** — `content.js` removes `on*` event handlers (`oncontextmenu`, `onselectstart`, `oncopy`, `oncut`, `onpaste`, `ondragstart`, `onmousedown`, `onmouseup`) and adds CSS overrides for `user-select`. It does NOT bypass JS-driven `event.preventDefault()` chains that are added later.
- **Idempotent enable/disable** — `enableUnlocker()` short-circuits if `eventController || observer` exist; `disableUnlocker()` only tears down listeners/observer/CSS, not the attributes removed while ON (per anti-pattern note).
- **Editable elements are preserved** — `isEditableElement()` skips `input/textarea/select/[contenteditable]` so user typing/right-click-paste in form fields still works as native.
- **Storage convention** — all three layers (`popup.js`, `background.js`, `content.js`) use the same `DEFAULT_SETTINGS = { enabled: true }` shape; treat changes as tri-party coordinated.
- **Git excludes** — `.omo/` (OMO run state), `.serena/` (memories + project.yml), `.git/`, `history/` are tool/runtime byproducts; the existing `.gitignore` should already cover `.serena/` per repo state.
- **LSP/codegraph unavailable for this project** — typescript LSP active client is rooted at `C:\NEW PRG\Open Sync`, not this repo. Rely on `read` + manual inspection for code understanding.
- **Korean-first UI** — popup labels and test page copy are Korean; do NOT translate without explicit request. README also intentionally Korean.