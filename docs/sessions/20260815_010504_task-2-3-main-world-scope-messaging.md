# 작업 2.3 — MAIN-world 범위와 사용자 설명 정합성

**날짜:** 2026-08-15 01:05
**작업:** v0-9-v0-10-benchmark-roadmap 작업 2.3
**상태:** 구현 완료 (정적 검증 통과, Chrome 수동 QA 게이트 남음)

## 변경 요약

MAIN-world 프로토타입 패치의 선점 보장을 훼손하지 않으면서, 팝업 UI에서 MAIN 패치가 확장이 켜져 있는 한 새로고침해도 유지됨을 정확히 설명하는 사용자 대면 메시징을 추가했다.

## 변경 파일

1. **`content-main.js`** — 헤더 주석 강화. 스토리지 읽기 금지와 MAIN 패치의 무조건 재적용 계약(확장이 켜져 있는 한 새로고침해도 재적용, 완전 복원은 확장 비활성화 + 새로고침)을 명시적으로 문서화. 동작 변경 없음.
2. **`popup.html`** — `#mainWorldNotice` 요소 추가 (`.notice` 아래, `role="status"` `aria-live="polite"`).
3. **`popup.css`** — `.main-world-notice` 스타일 추가 (기존 `.session-notice` 패턴 변형, gold 톤).
4. **`popup.js`** — `computeMainWorldNotice(state, modeLite)` 순수 함수 추출. `renderMainWorldNotice()`가 이를 호출하여 notice 가시성/텍스트 설정. OFF 또는 Lite 모드일 때만 reload hint 표시, ON+Ultimate일 때 숨김. "즉시 완전 복원" 약속 금지.
5. **`scripts/verify.ps1`** — MAIN blocked-event allowlist 검사 추가. `content-main.js`의 `BLOCKED_EVENT_NAMES`가 정확히 `contextmenu/selectstart/dragstart`인지, 코드(주석 제외)에 `chrome.storage`/`domainSettings` 등 금지 참조가 없는지 검증.
6. **`tests/unit/main-world-allowlist.test.js`** — 14개 테스트. allowlist drift 거부, 스토리지 읽기 금지, manifest MAIN-first 순서, reload messaging 상태 (OFF/Lite/ON+Ultimate/빈 hostname), "즉시 완전 복원" 및 "reload alone" 허위 주장 거부, popup.html/popup.js 소스 매칭.

## 주요 결정

1. **`computeMainWorldNotice`를 순수 함수로 추출** — `popup.js`는 브라우저 API에 의존하여 Node에서 직접 실행할 수 없으므로, 순수 함수만 추출하여 VM에서 평가하는 방식으로 테스트. `typeof module !== 'undefined'` 가드로 Node export 추가 (브라우저에서는 무시됨).
2. **주석 제거 후 금지 참조 검사** — `content-main.js` 헤더 문서가 금지된 API 이름(`chrome.storage`, `domainSettings`)을 의도적으로 언급하므로, 코드만 검사하기 위해 주석을 먼저 제거. Node 테스트와 verify.ps1 모두 동일한 접근.
3. **notice는 OFF 또는 Lite일 때만 표시** — ON+Ultimate일 때는 MAIN 패치가 사용자 의도와 일치하므로 notice 불필요. OFF일 때 "ISOLATED는 즉시, MAIN 패치는 확장이 켜져 있는 한 새로고침해도 다시 적용, 완전 복원은 확장 비활성화 + 새로고침", Lite일 때 "ISOLATED 기능에 즉시 적용, MAIN 패치는 확장이 켜져 있는 한 새로고침해도 유지"로 구분.

## 검증

- `node --test tests/unit/*.test.js`: 139개 테스트 전체 통과 (신규 14개 포함)
- `node --check content-main.js`, `node --check popup.js`: 구문 검사 통과
- `& .\scripts\verify.ps1 -RootPath (Get-Location)`: 7개 검사 전체 통과 (신규 allowlist 검사 포함)
- `git diff --check`: 통과 (LF-to-CRLF 경고는 사전 존재)

## 검증 제한

- `agent-lsp_blast_radius`는 `LSP client not initialized` 반환. codegraph 영향 분석, 제품 함수 Node/VM 테스트, `node --check`, repository verifier로 대체.
- 승인된 unpacked Chrome DevTools 대상이 없어 실제 브라우저에서 OFF 전환 후 MAIN 패치 잔존, Lite 전환 후 ISOLATED-only 즉시 적용, 확장이 켜져 있는 한 새로고침 시 MAIN 재적용, 확장 비활성화 + 새로고침 시 완전 복원을 직접 관찰하지 않았다. Chrome 수동 QA 게이트는 남아 있다.