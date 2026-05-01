# Right-click on Web — Agent Guide

## Project Type

No-build vanilla Chrome Extension (Manifest V3). No npm, no bundler.

## Key Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension config — permissions, content scripts, action/popup |
| `content.js` | Core logic: unblocks right-click, select, copy/drag, removes blocking attributes, observes DOM mutations |
| `background.js` | Minimal service worker — sets default storage on install |
| `popup.html/css/js` | Toggle UI with Ferrari-inspired red/black/gold styling |

## How to Run / Test

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select this folder
4. `tests/manual/blocked-page.html` — manual test page with blocked text/right-click/copy
5. Toggle ON/OFF via toolbar icon popup

## Package for Chrome Web Store

```powershell
# From repo root — creates right-click-on-web.zip
Compress-Archive -Path manifest.json,background.js,content.js,popup.html,popup.css,popup.js,icons -DestinationPath "right-click-on-web.zip" -Force
```

Exclude from ZIP: `.git`, `.serena`, `docs`, `tests`, `popup-preview.html`, `README.md`

## Important Constraints

- `host_permissions: ["<all_urls>"]` is required for content script to inject on all pages — this is intentional, not a mistake
- No `activeTab` or `scripting` permissions — they are unnecessary for this MVP
- `content.js` uses `document_start` + `all_frames: true` to handle blocking scripts as early as possible
- OFF mode removes injected CSS/listeners/observer but does NOT restore inline blocking attributes removed while ON — this is by design
- No remote code loading, no network calls, no telemetry
- Official Ferrari logos/trademarks are NOT used — only motorsport color inspiration (Rosso Corsa red, carbon black, gold accent)

## UI/UX Design Direction

- Premium motorsport aesthetic: dark cockpit black, Rosso Corsa red, gold accent
- No official brand imagery
- Popup: 340px wide, Korean language UI, high-contrast, focus-visible states
- Icon: mouse infographic with right button highlighted in red

## Known Limitations

Cannot bypass:
- DRM/protected media
- Image/canvas rendered text
- Server-side withheld text
- Closed Shadow DOM
- Heavily sandboxed iframes

## Key Working Files

```
manifest.json
background.js
content.js
popup.html / popup.css / popup.js
icons/icon128.png / icon512.png
tests/manual/blocked-page.html
docs/sessions/YYYYMMDD_HHMMSS_*.md   # session logs
docs/chrome-web-store-requirements.md # store submission guide
docs/store-submission-plan.md         # step-by-step submission plan
```