# 우회 기능 런타임 조사 및 재개 계획

**작성일:** 2026-08-11  
**조사 범위:** 중단된 v0.6.2 작업 상태, Chrome MV3 매니페스트 경로, 실사이트 우클릭 차단 해제의 런타임 재현 가능성

## 결론

현재 작업 트리에서 확인된 이전 핵심 결함은 이미 v0.6.2 변경으로 보완되어 있다. `content.js`가 저장소 설정을 비동기로 해석하기 전에 캡처 단계 인터셉터를 설치하지 않았기 때문에, 페이지가 먼저 `preventDefault()`를 호출하면 우클릭 기본 동작을 되돌릴 수 없었던 경쟁 조건이다.

현재 `content.js`는 설정 해석 전 `addEventInterceptors()`를 동기 실행하고, OFF 설정이 해석되면 같은 `AbortController`를 통해 이를 제거한다. 따라서 이 원인만으로 현재 작업 트리의 실패를 설명할 근거는 없다.

직접 Chrome을 `--load-extension`으로 실행하는 경로는 로컬 보안 제품과 충돌해 폐기했다. 대신 Playwright 관리 브라우저에서 저장소의 실제 `content-main.js`, `shared.js`, `content.js`를 매니페스트 순서로 실행하고 차단 페이지 동작을 재현했다. 이 경로에서 우클릭·선택·복사 이벤트의 취소는 모두 해제되었고 편집 가능 요소의 자체 복사 처리는 보존되었다.

이 결과는 현재 저장소의 이벤트 엔진에서 추가 코드 회귀가 재현되지 않았다는 증거다. 다만 Playwright 페이지 컨텍스트에서 스크립트를 순서대로 실행한 시험이므로, 실제 MV3의 MAIN/ISOLATED 분리 월드 주입이나 사용 중인 Chrome 프로필의 unpacked 확장 로드 상태, 화면에 표시되는 네이티브 메뉴 자체까지 증명하지는 않는다.

## 관측 근거

### 1. 이전 실사이트 실패 원인과 적용된 보완

`docs/sessions/20260811_104035_live-site-contextmenu-fix.md`에는 `https://ultimate-enable-right-click.github.io/`에서 다음 문제가 재현된 것으로 기록되어 있다.

- 페이지는 `body oncontextmenu="return false"` 및 이른 이벤트 리스너로 기본 메뉴를 막는다.
- 이전 구현은 `chrome.storage` 해석 완료 후에야 ISOLATED-world 캡처 인터셉터를 추가했다.
- 그 대기 중 페이지 리스너가 먼저 `preventDefault()`를 호출하면, 뒤늦은 확장 리스너의 `stopImmediatePropagation()`은 이미 취소된 기본 동작을 복구할 수 없다.

현재 `content.js`의 동작은 이 기록과 일치한다.

- `addEventInterceptors()`는 `eventController`가 존재하면 재등록하지 않는 멱등 함수다.
- 모듈 하단에서 `resolveAndApply()` 전에 `addEventInterceptors()`를 호출한다.
- 설정 결과가 OFF이면 `disableUnlocker()`가 인터셉터를 포함한 활성 자원을 해제한다.

### 2. 매니페스트 및 시작 경로

`manifest.json`은 JSON으로 정상 파싱되며, Chrome MV3 실행을 막는 구조적 오류를 발견하지 못했다.

- MAIN-world `content-main.js`가 첫 번째 `content_scripts` 항목이고, ISOLATED-world `shared.js`와 `content.js`가 두 번째 항목이다. 둘 다 `document_start`와 `all_frames`를 선언한다.
- `world: "MAIN"`, `match_origin_as_fallback`, `sidePanel` 사용에 대해 `minimum_chrome_version: "121"`이 충분하다.
- `background.service_worker`와 Firefox 호환용 `background.scripts`가 함께 선언되어 있다. Chrome 121+에서는 MV3의 `scripts` 선언을 무시하고 `service_worker`를 사용하므로, 현재 최소 버전 범위에서 차단 요인이 아니다.
- Chrome 서비스 워커는 `background.js`에서 `importScripts('shared.js')`로 공유 모듈을 로드하며, Firefox의 `scripts` 경로는 이미 로드된 전역값을 감지해 중복 로드를 피한다.

### 3. 작업 트리 상태

조사 시점에 다음 기존 변경이 있었다. 이 문서는 해당 변경을 되돌리거나 수정하지 않는다.

- `content.js`, `content-main.js`, `background.js`, `popup.js`, `options.js`, `manifest.json`, `tests/manual/blocked-page.html`, `AGENTS.md`
- 미추적 문서 디렉터리: `docs/plans/`, `docs/reviews/`
- 최근 커밋은 `f608943`이며, 현재 v0.6.2 변경은 아직 커밋되지 않은 상태다.

정적 점검에서 MAIN 우선 순서, `shared.js` 로드 순서, QA 통계 DOM 채널의 `data-right-click-on-web` 표식과 `__rightClickOnWebStats` ID는 서로 일치했다.

### 4. 관리 브라우저 이벤트 경로 검증

2026-08-11 후속 검증에서는 보안 제품을 자극하는 Chrome 직접 실행을 반복하지 않고 Playwright 관리 브라우저를 사용했다. 시험용 `chrome.storage` 모형을 공유 모듈의 콜백 계약에 맞춘 뒤, 다음 순서로 저장소 파일을 실행했다.

1. `content-main.js`
2. `shared.js`
3. `content.js`

첫 번째 합성 이벤트 시험에서 확인한 결과는 다음과 같다.

- MAIN 패치 guard와 공유 모듈이 모두 초기화되었다.
- 인라인 `oncontextmenu="return false"` 속성이 제거되었다.
- `user-select: none`의 계산값이 `text`로 바뀌었다.
- 일반 요소의 `contextmenu`, `selectstart`, `copy` 이벤트는 페이지 차단 리스너까지 도달하지 않았고 `defaultPrevented`도 `false`였다.
- `textarea`의 복사 리스너는 호출되어 편집 가능 요소 예외가 보존되었다.

두 번째 실제 입력 시험에서는 Playwright 마우스 드래그, `Control+C`, 우클릭을 사용했다.

- 드래그로 전체 시험 문장이 실제 Selection에 들어갔다.
- 페이지의 복사 차단 리스너 호출 횟수는 0이었다.
- 페이지의 우클릭 차단 리스너 호출 횟수는 0이었다.
- 계산된 `user-select` 값은 `text`였다.

따라서 저장소 이벤트 엔진에 대한 최소 수정 조건은 성립하지 않았다. 재현되지 않은 결함을 가정해 `content-main.js`나 `content.js`를 추가 변경하는 대신 현재 v0.6.2 구현을 유지한다.

## 아직 확인되지 않은 항목

다음 항목은 실제 브라우저 세션에서만 확정할 수 있다.

1. Chrome이 현재 작업 트리의 unpacked 확장을 실제로 로드하고 `content-main.js`와 `content.js`를 대상 문서에 주입하는지
2. `ultimate-enable-right-click.github.io`에서 네이티브 우클릭 메뉴가 표시되는지
3. 사이트별 OFF 설정이 설정 해석 직후 인터셉터를 제거하는지
4. 실제 MV3 분리 월드에서도 편집 가능한 요소의 복사·붙여넣기 핸들러가 동일하게 보존되는지
5. `chrome.storage.session.setAccessLevel()`이 서비스 워커 기동 후 content script 접근을 허용하는지

## 런타임 검증 제약

이번 조사에서 새 Chrome 프로필과 로컬 CDP 포트 `127.0.0.1:9223`으로 unpacked 확장을 실행하려 했으나, 직접 Chrome 실행 경로가 로컬 보안 제품과 충돌했다. 레지스트리에서 확인한 Chrome 확장 설치 정책 값은 비어 있었다. 명시적인 확장 설치 차단 정책은 관측되지 않았지만, 보안 제품을 우회하거나 같은 직접 실행을 반복하지 않았다.

따라서 자동화 실패는 다음 중 하나일 수 있다.

- 이 환경의 Chrome 실행 또는 원격 디버깅 제약
- 브라우저 프로필·보안 제품·사용자 세션 수준의 제약
- 확장 로드 오류

관리 브라우저 시험에서 이벤트 엔진은 정상 동작했으므로 직접 실행 실패를 확장 기능 회귀의 증거로 취급하지 않는다. 실제 사용자 Chrome에서 문제가 계속되면 우선 unpacked 항목이 현재 작업 트리를 가리키는지, 확장을 새로고침했는지, 대상 탭을 다시 로드했는지 확인해야 한다.

## 재개 구현 계획

### 단계 1: 실제 확장 로드 상태 확정

1. `chrome://extensions`에서 기존 unpacked 항목을 이 작업 트리로 다시 로드하거나 새로고침한다.
2. 확장 카드의 오류 버튼과 서비스 워커 검사 화면에서 `background.js` 예외가 없는지 확인한다.
3. 대상 탭을 새로 열거나 새로고침한 뒤 DevTools의 실행 컨텍스트에서 MAIN과 ISOLATED content script가 주입되었는지 확인한다.

**완료 기준:** 확장 카드 오류가 없고, 대상 문서에서 두 content script의 주입 여부를 관측한다.

### 단계 2: 핵심 우회 경로 검증

1. `https://ultimate-enable-right-click.github.io/`에서 우클릭을 실행한다.
2. `contextmenu` 이벤트의 `defaultPrevented` 상태와 네이티브 메뉴 표시를 확인한다.
3. `tests/manual/blocked-page.html`은 확장의 파일 URL 접근 권한을 켠 경우에만 실행하고, QA 통계 DOM 채널을 확인한다.

**완료 기준:** 대상 사이트에서 네이티브 메뉴가 열리고, 수동 QA 페이지에서 인터셉션 통계 또는 주입 표식이 확인된다.

### 단계 3: 설정 및 호환성 경계 검증

1. 대상 도메인을 OFF로 설정한 뒤 탭을 새로고침해 인터셉터가 해제되는지 확인한다.
2. Ultimate와 Lite 모드에서 선택 스타일 주입 차이만 존재하는지 확인한다.
3. `input`, `textarea`, `select`, `contenteditable`에서 복사·붙여넣기와 우클릭이 사이트 동작을 보존하는지 확인한다.

**완료 기준:** 전역·도메인·세션 우선순위와 편집기 예외가 설계대로 동작한다.

### 단계 4: 결과에 따른 최소 수정

- 확장 카드 또는 서비스 워커 오류가 확인되면 해당 예외가 난 파일만 수정한다.
- MAIN/ISOLATED 주입은 되었으나 우클릭이 막히면 페이지 이벤트 리스너 순서와 inline IDL 핸들러 경로를 재현해 `content-main.js` 또는 `content.js`를 최소 수정한다.
- 주입이 전혀 되지 않으면 매니페스트를 다시 수정하기 전에 Chrome의 실제 오류 메시지를 근거로 원인을 분리한다.
- 런타임이 정상이라면 코드 변경 대신 현재 v0.6.2 변경을 검증·정리·커밋 대상으로 전환한다.

## 변경 원칙

- MAIN-world와 ISOLATED-world content script를 하나로 합치지 않는다.
- 전역 `preventDefault()` 또는 debugger 계열 우회 패치를 추가하지 않는다.
- 기존 사용자 변경은 되돌리지 않는다.
- 실제 브라우저 오류 또는 재현된 동작으로 뒷받침되는 최소 변경만 적용한다.
