# tests/ — AGENTS.md

**Part of:** Right-click on Web (root `AGENTS.md` is the project knowledge base — this file only adds QA-specific rules)

## OVERVIEW

Two QA layers: the manual browser harness (`tests/manual/blocked-page.html`, 15 scenarios) and 15 Node unit-test files exercising pure helpers (settings/state/geometry/keyboard logic) — no `chrome.*` API-level mocking.

## STRUCTURE

```
tests/
├── manual/
│   ├── blocked-page.html   # Korean QA harness — 15 scenarios, exposes runtime stats bridge
│   └── screenshot.png      # visual reference
└── unit/                   # node --test, pure-function boundary only
    ├── settings-characterization.test.js    # shared.js parseDomainSetting/normalizeDomainSettings
    ├── content-feature-gates.test.js        # content.js EVENT_FEATURE_MAP / ATTRIBUTE_FEATURE_MAP
    ├── main-world-allowlist.test.js         # content-main.js BLOCKED_EVENT_NAMES allowlist
    ├── ocr-session-utils.test.js            # session state reducer / rerun + last-region validation
    ├── ocr-history.test.js                  # 20 entries / 30 days / 64 KiB bounds
    ├── ocr-image-utils.test.js              # canvas preprocessing pipeline (profile/upscale/gray/invert/threshold)
    ├── image-context.test.js                # image context geometry cache shape
    ├── crop-geometry.test.js                # crop geometry math
    ├── crop-overlay-regression.test.js      # overlay regressions
    ├── keyboard-radiogroup.test.js          # crop + preset keyboard helpers
    ├── toolbar-action-utils.test.js         # toolbar action state helper
    ├── toolbar-action-background.test.js    # background-side toolbar resolution
    ├── options-profile-ui.test.js           # options advanced switches
    ├── popup-preset-ui.test.js              # preset radio UI behavior
    └── popup-diagnostic-report.test.js      # privacy-safe diagnostic serializer
```

## COMMANDS

```powershell
# Run all unit tests (Windows: explicit glob REQUIRED — a bare `tests/unit` dir arg is treated as a module path, memory #674)
node --test tests/unit/*.test.js

# Syntax check a product file before relying on it
node --check content.js

# Full release gate (syntax + manifest shape + assets + git diff --check) — this is the gate, not tests/unit
.\scripts\verify.ps1
```

## CONVENTIONS

- **Pure-function boundary** — unit tests import pure modules only (`shared.js` via `module.exports`, `ocr-session-utils.js`, etc.); DOM/API-touching code is verified manually. See `docs/sessions/20260813_201529_pure-function-test-boundary.md`.
- **Manual scenario per feature** — add a scenario to `blocked-page.html` for every user-visible bypass feature (currently 15: 8×v0.2.0 + 2×v0.3.0 + Lite/Ultimate + v0.7.0 + v0.8.0 sections).
- **Stats bridge** — `content.js` publishes `window.__rightClickOnWebStats`; the harness polls it via `rcow:requestStats`/`rcow:responseStats` CustomEvents (not direct reads), schema-validating `attributeRemovals`/`eventInterceptions`/`periodicRescans` + resolveSource/matchedDomain/mode/preset.
- **Verification commands** — session notes record the exact test command + pass counts (e.g. `node --test tests/unit/*.test.js` → 312 passed); keep them reproducible.
- **Browser QA** — headless `--load-extension` automation is blocked by profile policy (memory #447); verify the unpacked extension manually through `chrome://extensions`, or use the managed-browser path.
- **Coverage gap (known)** — `offscreen.js` has no paired unit test; it is verified only via manual scenario 15 + `scripts/verify.ps1` asset checks.

## ANTI-PATTERNS

- Do not write unit tests that spin up `chrome.storage` / `chrome.runtime` / DOM — that belongs to manual or managed-browser QA.
- Do not run `node --test tests/unit` (directory) on Windows — always the explicit glob.
- Do not treat unit-test green as a release gate — `scripts/verify.ps1` at the repo root is the gate.
