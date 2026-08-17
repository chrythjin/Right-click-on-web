# docs/ — AGENTS.md

**Part of:** Right-click on Web (root `AGENTS.md` is the project knowledge base — this file only adds docs-specific rules)

## OVERVIEW

Korean-first documentation hub: store-submission artifacts, benchmarking roadmap, runtime investigation, timestamped plans/reviews, and the session log. Also the GitHub Pages publishing root for `privacy-policy.html`.

## STRUCTURE

```
docs/
├── INDEX.md                     # Korean doc index (main docs + recent sessions) — keep current
├── store-submission-plan.md     # end-to-end Chrome Web Store submission procedure
├── chrome-web-store-requirements.md
├── deployment-manual.md
├── store-listing.md             # CWS registration form copy (title/description/category/region)
├── benchmarking-roadmap.md      # Single source of truth for roadmap (do NOT use separate plan files)
├── bypass-runtime-investigation.md
├── privacy-policy.html          # served verbatim via GitHub Pages
├── .nojekyll                    # disables Jekyll so the HTML is served verbatim
├── plans/                       # timestamped improvement/implementation plans
├── reviews/                     # timestamped full code reviews
└── sessions/                    # 56 files, YYYYMMDD_HHMMSS_<task>.md session notes
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Release/deploy procedure | `deployment-manual.md` |
| Roadmap & competitor gap analysis | `benchmarking-roadmap.md` (single source of truth — memory #437) |
| CWS submission walkthrough | `store-submission-plan.md` |
| Store listing copy | `store-listing.md` |
| Privacy policy (published) + CWS wording | `privacy-policy.html` + `sessions/20250810_183934_cws-privacy-practice-permission-rationale.md` |
| Bypass runtime investigation (v0.6.2-era) | `bypass-runtime-investigation.md` |
| Feature-history rationale | `sessions/` (newest first by filename) |

## CONVENTIONS

- **Session notes** — written after successful implementation (global rule), named `sessions/YYYYMMDD_HHMMSS_<task>.md`, Korean, with `변경 사항` / `검증` sections listing the exact commands run (`node --check`, `node --test tests/unit/*.test.js`, verification results).
- **INDEX.md** — must be updated whenever new documents land in `sessions/` or top-level docs (global session-end checklist item 3).
- **Korean-first** — store docs and session notes are Korean; only CWS-facing registration copy stays English. Do not translate Korean copy without explicit request.
- **plans/ and reviews/** — same `YYYYMMDD_<topic>` timestamp naming as sessions.
- **GitHub Pages** — `privacy-policy.html` publishes from `docs/` on push to main (`.nojekyll`); any new `.html` under `docs/` auto-publishes, so review content before pushing.
- **Privacy wording** — OCR "no collection/transmission" claims are scoped to no developer/third-party collection, while preserving the on-device processing + opt-in local history distinction (memory #712).

## ANTI-PATTERNS

- Do not store runtime byproducts, backups, or generated files under `docs/`.
- Do not duplicate doc content into AGENTS.md — index, don't paste.
- Do not update `privacy-policy.html` without keeping the CWS privacy-practice wording and store docs in sync.
- Do not treat `docs/plans/` files as the active plan source for roadmap work — `benchmarking-roadmap.md` wins (memory #437).
