# 세션 작업 — 실사이트 우클릭 차단 해제

**시작:** 2026-08-11 10:40
**대상:** `https://ultimate-enable-right-click.github.io/`
**릴리스:** v0.6.2

## 문제 재현

대상 페이지는 `body`에 `oncontextmenu="return false"`를 선언하고 이른 문서 이벤트 리스너도 설치한다. 확장 없는 브라우저에서 합성 `contextmenu` 이벤트를 발생시킨 결과는 `dispatchAllowed=false`, `defaultPrevented=true`였다.

## 근본 원인

`content.js`는 `document_start`에 로드되지만, ISOLATED-world 캡처 인터셉터 설치는 `chrome.storage`의 세션·도메인·전역 설정을 비동기로 해석한 뒤 `enableUnlocker()` 안에서 이뤄졌다. 이 대기 중 페이지 스크립트가 먼저 캡처 리스너를 등록해 `preventDefault()`를 호출하면, 나중에 설치된 확장 리스너의 `stopImmediatePropagation()`은 이미 설정된 `defaultPrevented` 상태를 되돌릴 수 없다.

## 변경

- 저장소 조회 전에 `addEventInterceptors()`를 동기 호출한다.
- `addEventInterceptors()`를 멱등 처리해 설정 해석 뒤의 정상 활성화 경로와 중복되지 않게 한다.
- 설정 결과가 OFF이면 `disableUnlocker()`가 기존 `AbortController`를 중단하므로 사용자 설정 의미는 유지한다.
- 모든 저장소 읽기가 일시 실패하면 확장의 기본값인 ON을 유지한다.
- 배포 식별을 위해 `manifest.json` 버전을 0.6.2로 올렸다.

## 검증

- `node --check content.js`: 통과.
- 변경 파일 LSP 진단: 오류 없음.
- 실제 사이트 수정 전: `dispatchAllowed=false`, `defaultPrevented=true` 재현.
- 새 문서에서 확장과 같은 순서로 초기 캡처 방어를 먼저 설치한 후 `body oncontextmenu="return false"`를 생성: `dispatchAllowed=true`, `defaultPrevented=false` 확인.
- 실제 설치본은 Chrome 정책상 자동 `--load-extension` 검증이 차단되어, 생성 패키지를 설치/업데이트한 실제 사용자 Chrome에서 최종 우클릭 메뉴 확인이 필요하다.
