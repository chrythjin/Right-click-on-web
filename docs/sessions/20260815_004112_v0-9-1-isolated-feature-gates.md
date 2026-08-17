# v0.9.1 ISOLATED 기능별 게이트

## 작업 범위

- `content.js`의 모든 resolve 결과에 `parseDomainSetting()`의 정규화된 `preset`, `mode`, `features`를 포함했다.
- 이벤트와 인라인 `on*` 속성을 단일 feature mapping으로 연결하고, CSS·overlay cleanup·Shadow DOM 순회·attribute removal을 활성 profile별로 분기했다.
- profile 변경 시 이벤트 controller, MutationObserver, Shadow DOM observer, CSS, overlay 변경, periodic/idle rescan을 완전히 해제한 뒤 새 profile로 다시 적용하도록 생명주기를 정리했다.
- `content-main.js`와 manifest의 MAIN-first 이중 world 계약은 변경하지 않았다.

## 기능 계약

- `dragDrop:false`이면 `dragover`와 `drop` listener 및 대응 인라인 속성 제거가 모두 비활성화된다.
- `mousedown`/`mouseup` interception은 `contextMenu`에 속하지만 기존 secondary-button 조건을 유지하며, 일반 왼쪽·중간 클릭과 touch chain에는 새 listener를 추가하지 않는다.
- `ultimateCss:true`일 때도 selection, dragStart, contextMenu, printUnhide별 CSS rule만 조합한다. `printUnhide:true`이면 기존 `@media print` 표시 복구 rule을 보존한다.
- `overlayCleanup`으로 바꾼 `pointer-events`는 profile 전환 또는 비활성화 시 원래 inline 값과 priority로 복원한다.
- `shadowDom:false`이면 open Shadow Root 탐색·observer·CSS 주입을 하지 않는다.
- 공개 stats snapshot에 현재 `preset`과 복제한 `features`를 추가했다.

## 테스트

- `tests/unit/content-feature-gates.test.js`는 실제 `shared.js`와 `content.js`를 Node VM 브라우저 하네스에서 실행한다.
- safe, selection, complete, upload-safe, media-safe, custom profile의 listener/CSS/attribute 결과를 검증한다.
- `dragDrop:false`, secondary-button 전용 mouse 처리, overlay 복원, Shadow DOM 게이트, 반복 profile 적용과 전체 teardown/reapply를 검증한다.

## 검증

- `node --test tests/unit/*.test.js`: 125개 통과.
- `node --check content.js`: 통과.
- `& .\scripts\verify.ps1 -RootPath (Get-Location)`: 통과.
- 변경 제품/테스트 파일 built-in diagnostics: 오류 없음.
- `agent-lsp_blast_radius`: LSP client 미초기화로 실행 불가. CodeGraph 영향 분석과 제품 VM 테스트로 보완했다.
- ast-grep 전용 skill은 triage에서 제공되지 않아 구조적 검색으로 listener/inline handler 위치를 확인했다.

승인·연결된 unpacked Chrome 대상이 없어 실제 사이트 profile 전환 수동 QA는 수행하지 않았으며, 자동화 결과를 Chrome 수동 QA 통과로 간주하지 않는다.
