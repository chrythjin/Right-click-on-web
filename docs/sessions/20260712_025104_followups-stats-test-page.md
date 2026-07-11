# 우클릭 방지 우회 — 후속 작업 3건 일괄 적용

**날짜**: 2026-07-12
**이전 세션**: `20260712_024332_additional-unblock-patterns.md`
**대상**: `content.js` (확장), `tests/manual/blocked-page.html` (확장), `README.md` (확장)

## 후속 작업 3건

### 1. `tests/manual/blocked-page.html` — 신규 시나리오 4종 + 통계 보기 UI 추가

기존 기본 차단 시나리오(우클릭/선택/복사/드래그)에 다음 4개 섹션 추가:

- **섹션 2: 이미지 드래그 저장** — `<img style="-webkit-user-drag: none; user-drag: none;">` 케이스. SVG 이미지(`data:image/svg+xml`) 사용
- **섹션 3: 텍스트 드롭 영역** — `<div ondragover="return false" ondrop="return false">` 케이스
- **섹션 4: 차단 오버레이** — 절대 위치 transparent overlay + 인라인 on* 핸들러 4종. `position: relative`인 `.overlayHost` 컨테이너 안에 `.overlayBlocker` div를 깔아둠
- **섹션 5: 모바일 터치** — `<img ontouchstart="return false" ontouchend="return false">` 케이스. 데스크탑에선 시뮬레이션 한계, 모바일 실기기/에뮬레이터 권장

추가 UI:
- "동적 차단 오버레이 추가" 버튼 — MutationObserver가 동적으로 추가되는 차단도 잡는지 검증
- "실행 통계 보기" 버튼 — `window.__rightClickOnWebStats` 노출값 표시

스타일 보강:
- `.dropZone` (드롭 영역)
- `.overlayHost` / `.overlayBlocker` (오버레이 테스트용)
- `section.stage-blocked` (기존 `.blocked` 일반화)
- `.counterStrip` (통계 패널)

### 2. `README.md` — 기능 범위/수동 테스트 갱신

기능 범위 11개 항목으로 확장(기존 6개 → 11개):
- 기존: 우클릭/텍스트 선택/복사/잘라내기/드래그/인라인 속성 제거/MutationObserver/ON-OFF
- 신규: 텍스트 드롭(dragover/drop), 모바일 길게 누르기(touchstart), 이미지 드래그 저장(user-drag CSS 무효화), 차단 오버레이 무력화, 실행 통계

수동 테스트 섹션 분리: 기본 시나리오 + 신규 시나리오(섹션 2~5) + 동적 버튼 + 통계 보기.

권한 설명의 `storage` 항목에 "및 통계" 추가.

### 3. `content.js` — 인-메모리 통계 카운터 (`window.__rightClickOnWebStats`)

`RIGHT_CLICK_ON_WEB` 상수 구조와 의미 있는 카운터 통합을 위해 다음 추가:

- **`createStats()`** — 정의된 `blockedAttributes`와 `blockedEvents` 각각에 대해 키=0으로 초기화된 객체 생성
- **`resetStats()`** — `stats = createStats()` 후 `window.__rightClickOnWebStats = stats`로 전역 노출. `enableUnlocker()` 진입 시 호출로 새 측정 세션 시작
- **`bumpAttributeRemoval(attribute)`** — `removeBlockingAttributes` 내부에서 속성 제거 시 카운터 증가
- **`bumpEventInterception(eventName)`** — `handleInterceptedEvent` 클로저에서 캡처 후 카운터 증가
- **`handleInterceptedEvent(eventName)`** — 기존 `allowBrowserDefault`를 클로저 팩토리로 재작성. `eventName`을 캡처해 카운터에 반영
- **`addEventInterceptors()`** — `document.addEventListener` 호출을 팩토리 결과로 교체
- **`neutralizeBlockOverlay()`** — `true`/`false` 반환으로 무력화 적용 여부 명시
- **`removeBlockingAttributes()`** — `neutralizeBlockOverlay` 반환값 보고 `stats.overlaysNeutralized += 1` 누적

페이지 로드 시점에 `let stats = createStats()`로 초기값 0 객체 보유. 확장 OFF 상태에선 `window.__rightClickOnWebStats`가 미설정 → 테스트 페이지 "통계 데이터 없음" 표시.

#### 카운터 형태

```js
{
  attributeRemovals: {
    oncontextmenu: 5,
    oncopy: 3,
    ondragstart: 2,
    // ...
  },
  eventInterceptions: {
    contextmenu: 12,  // 매 우클릭마다 증가 (사용자 액션 카운트)
    copy: 1,
    // ...
  },
  overlaysNeutralized: 1
}
```

`attributeRemovals`는 페이지가 차단하려고 걸어둔 인라인 핸들러 수(사이트의 차단 시도 횟수).
`eventInterceptions`는 capture phase에서 우리가 가로챈 이벤트 수(우클릭/복사 시도 횟수에 근사).
`overlaysNeutralized`는 차단 오버레이 div 무력화 적용 횟수.

## 변경 파일

| 파일 | 종류 | 변경 |
|---|---|---|
| `content.js` | 핵심 로직 | 통계 카운터 + 팩토리 클로저 + `enableUnlocker`에 `resetStats` 추가 |
| `tests/manual/blocked-page.html` | 테스트 페이지 | 4개 섹션 추가 + 동적 버튼 + 통계 UI |
| `README.md` | 문서 | 기능 범위 11개 항목 + 수동 테스트 보강 |

## 검증

- `ocr review` 실행: 7개 파일, 통계 카운터/주석 일관성/예외 처리 관련 권고 2건 반영
  - 동적 차단 오버레이에 `onselectstart="return false"` 추가(정적 오버레이와 일관)
  - `JSON.stringify` `try-catch`로 감싸서 직렬화 오류 시 "통계 데이터 직렬화 오류" 표시

## 백업

`history/file-backups/`:
- `blocked-page.html_20260712_024712_win32_U-N-00658` (섹션 확장 전)
- `README.md_20260712_024712_win32_U-N-00658` (기능 범위 갱신 전)

`content.js`는 직전 세션(`024332`)에서 백업 완료 — 본 세션에서는 추가 백업 생략.

## 트라이파티 코디네이션

`popup.js`, `background.js` 변경 없음. 본 작업은 `content.js` + 테스트 페이지 + 문서 한정.
`window.__rightClickOnWebStats`는 content script가 주입되는 페이지 컨텍스트에서만 노출되며 storage에 저장되지 않음(인-메모리).
