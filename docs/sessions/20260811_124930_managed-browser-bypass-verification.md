# 관리 브라우저 우회 기능 검증

**일시:** 2026-08-11 12:49:30  
**범위:** v0.6.2 이벤트 우회 엔진의 우클릭·선택·복사 동작과 편집 가능 요소 예외

## 배경

시스템 Chrome을 `--load-extension`으로 직접 실행하는 검증 경로가 로컬 보안 제품과 충돌했다. 같은 실행 방식을 반복하거나 보안 제품을 우회하지 않고, 이미 허용된 Playwright 관리 브라우저에서 저장소 스크립트의 이벤트 경로를 검증했다.

## 검증 구성

Playwright 페이지에 공유 모듈이 요구하는 콜백형 `chrome.storage` 계약을 제공한 뒤 저장소 파일을 다음 순서로 실행했다.

1. `content-main.js`
2. `shared.js`
3. `content.js`

시험 페이지에는 다음 차단 동작을 설치했다.

- `oncontextmenu="return false"`
- `user-select: none`
- `contextmenu`, `selectstart`, `copy`에서 `preventDefault()`를 호출하는 페이지 리스너
- 별도 `textarea` 복사 리스너

## 관측 결과

### 합성 취소 가능 이벤트

- MAIN 패치 guard가 활성화되고 공유 모듈이 로드되었다.
- 일반 요소의 인라인 `oncontextmenu` 속성이 제거되었다.
- 일반 요소의 계산된 `user-select` 값은 `text`였다.
- `contextmenu`, `selectstart`, `copy`는 페이지 차단 리스너까지 도달하지 않았다.
- 세 이벤트 모두 `defaultPrevented: false`, `dispatchEvent()` 결과 `true`였다.
- `textarea`의 복사 리스너는 호출되고 이벤트를 취소할 수 있어 편집 가능 요소 예외가 유지되었다.

### 실제 사용자 입력

- 마우스 드래그로 시험 문장 전체가 Selection에 들어갔다.
- `Control+C` 후 페이지 복사 차단 리스너 호출 횟수는 0이었다.
- 실제 우클릭 후 페이지 `contextmenu` 차단 리스너 호출 횟수는 0이었다.
- 시험 요소의 계산된 `user-select` 값은 계속 `text`였다.

## 판정

현재 작업 트리의 이벤트 우회 엔진에서는 추가 코드 결함이 재현되지 않았다. 따라서 근거 없는 추가 패치는 적용하지 않았다. v0.6.2의 동기 캡처 인터셉터와 MAIN 우선 패치가 의도한 이벤트 경로를 복구한다.

## 검증 경계

이 시험은 저장소의 실제 스크립트와 실제 Playwright 입력을 사용했지만, 확장 자체를 설치한 시험은 아니다. 다음 항목은 별도의 실제 Chrome 확인 대상으로 남는다.

- MV3 MAIN/ISOLATED 분리 월드의 실제 주입
- 사용 중인 Chrome 프로필에서 unpacked 확장이 현재 작업 트리를 가리키는지
- 네이티브 우클릭 메뉴가 화면에 표시되는지
- 도메인 OFF, Lite/Ultimate, 세션 저장소 접근의 실제 확장 동작

사용자 Chrome에서 문제가 계속되면 코드 변경보다 먼저 `chrome://extensions`에서 unpacked 경로와 오류를 확인하고, 확장 새로고침 후 대상 탭을 다시 로드해야 한다.
