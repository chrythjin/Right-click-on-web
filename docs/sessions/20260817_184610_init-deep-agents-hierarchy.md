# init-deep AGENTS.md 계층 갱신

**일시:** 2026-08-17 18:46
**태스크:** /init-deep — 계층형 AGENTS.md 지식 베이스 생성 (update 모드)

## 변경 사항

- **루트 `AGENTS.md` 갱신 (64 insertions / 15 deletions)**
  - 생성일 표기 갱신: 2026-08-17 init-deep refresh (v0.10.0 타깃 manifest.json으로 확인)
  - STRUCTURE 트리 누락 파일 추가: `ocr-image-utils.js`, `scripts/verify.ps1`, `sync/tools/delta-backup.js`, `tests/unit/`(15개), `docs/` 하위(`INDEX.md`, `bypass-runtime-investigation.md`, `plans/`, `reviews/`, sessions 55개)
  - WHERE TO LOOK 정정/보강:
    - content_scripts 오케스트레이션 항목을 3개 → **4개**(MAIN `content-main.js` → ISOLATED `image-context.js` → `["shared.js","content.js"]` → `["keyboard-utils.js","crop-overlay.js"]`+css)로 정정 (manifest.json 직접 확인)
    - `BLOCKED_EVENT_NAMES`↔`EVENT_FEATURE_MAP` 교차 참조 라인 정정 (content-main.js:78 / content.js:22)
    - 신규 행: OCR 전처리 파이프라인, 단위 테스트, 릴리스 게이트 검증, docs 인덱스·조사 노트, .gitignore 툴 디렉터리
    - 수동 QA 행에 `rcow:requestStats`/`rcow:responseStats` CustomEvent 브리지 명시
  - **CODE MAP 섹션 신설** — LSP(typescript) + `.codegraph/` 기반 핵심 심볼 16행 (content.js / content-main.js / shared.js / background.js / popup.js / ocr-session-utils.js / ocr-image-utils.js, 라인 번호 검증 완료)
  - COMMANDS 추가: `node --test tests/unit/*.test.js`(Windows 명시적 glob 필수) + `.\scripts\verify.ps1`
  - NOTES 정정/보강: 구식 "LSP/codegraph unavailable" → "available" 노트 교체, .gitignore 항목 보강, v0.10.0 릴리스 게이트 계약(ZIP 24항목 SHA-256, memory #716) 노트 추가
- **`docs/AGENTS.md` 신규 생성 (53줄)** — docs 전용 관례: 세션 노트 명명(`YYYYMMDD_HHMMSS_<task>.md`), INDEX.md 유지 의무, plans/reviews 타임스탬프 명명, GitHub Pages 게시(`.nojekyll`), CWS 개인정보 문구 동기화, 한국어 우선
- **`tests/AGENTS.md` 신규 생성 (60줄)** — QA 전용 규칙: pure-function 경계(순수 함수만 단위 테스트), 수동 시나리오 15개 규칙, stats CustomEvent 브리지, offscreen.js 커버리지 갭 명시, `node --test tests/unit`(디렉터리) 금지

## 검증

- `node --test tests/unit/*.test.js` → **312 passed / 0 failed** (exit 0) — 문서화한 명령이 실제 동작
- `.\scripts\verify.ps1` → **Verification passed** (exit 0) — JS 문법, manifest 형상(MAIN-first 4개), blocked-event allowlist, 자산 존재, background 스크립트 순서, `git diff --check` 전 항목 PASS
- 라인 번호 사실 검증(grep): `EVENT_FEATURE_MAP` = content.js:22 ✓, `RIGHT_CLICK_ON_WEB` = content.js:47 ✓, `BLOCKED_EVENT_NAMES` = content-main.js:78 ✓
- manifest.json 직접 확인 — content_scripts 4개 항목, background `scripts` 배열 순서(shared → ocr-session-utils → ocr-history → toolbar-action-utils → image-context → background), offscreen.html 로컬 스크립트만 사용
- LSP `lsp_symbols`(document) — content.js / shared.js / content-main.js / background.js 심볼 목록으로 CODE MAP 라인 번호 확정
- explore 에이전트 4개 백그라운드 병렬 실행 결과 병합 — 구조/관례/테스트/docs 팩트 교차 확인 (sessions 55개, CustomEvent 브리지, image-context.js 이중 로드, offscreen.js 테스트 부재 등)
- `git status` — 의도한 파일 3개만 변경 (AGENTS.md M / docs/AGENTS.md ?? / tests/AGENTS.md ??)

## 비고

- 소스 코드 변경 없음 (문서 전용 변경) → v0.10.0 ZIP 재생성 불필요
- 하위 AGENTS.md는 루트 내용을 반복하지 않으며, 루트에서 "see tests/AGENTS.md" / "see docs/AGENTS.md"로 교차 참조
