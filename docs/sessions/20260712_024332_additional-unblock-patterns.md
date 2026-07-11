# 우클릭 방지 우회 — 추가 패턴 5종 적용

**날짜**: 2026-07-12
**커밋**: (uncommitted)
**대상**: `content.js`
**유형**: 기능 확장 (MVP 범위 내)

## 사용자 요청

기존 8개 차단 패턴(우클릭/드래그/텍스트 선택/복사 등) 외에 추가로 풀 수 있는 패턴이 있는지 묻고, 후보를 정리한 뒤 전부 적용 지시.

## 추가된 차단 패턴 5종

### 1. `dragover` / `drop` 인터셉트 (요청 항목 1)

`blockedEvents`에 추가. 페이지 측 drop target(`<div ondrop="return false">`, `addEventListener('dragover', e => e.preventDefault())`)이 텍스트 드롭을 막는 케이스 해결. capture phase에서 `stopImmediatePropagation()`으로 페이지 측 핸들러 무력화.

부작용: 일부 사이트의 파일 업로드용 드래그앤드롭 UI도 같이 풀림(대부분 직관적).

### 2. `touchstart` / `touchend` / `touchmove` 인터셉트 (요청 항목 2)

`blockedEvents`에 추가. 모바일 Chrome에서 길게 누를 때 컨텍스트 메뉴(이미지 저장/링크 복사)를 띄우지 못하게 막는 사이트 대응. 데스크탑에선 무영향.

### 3. `-webkit-user-drag` / `user-drag` CSS 무효화 (요청 항목 3)

`injectSelectionStyle()`의 CSS에 추가. 이미지에 `user-drag: none` 또는 `-webkit-user-drag: none`이 걸려 데스크탑으로 드래그 저장이 안 되는 사이트 해결. `img, a` 셀렉터에 별도 규칙도 추가.

부작용: 거의 없음(드래그 저장은 항상 가능해야 하는 매체 특성).

### 4. `oncopy` / `oncut` / `onpaste` 이벤트 인터셉트 일관화 (요청 항목 4)

기존엔 속성(`oncut`, `onpaste`)만 제거하고 이벤트 인터셉트는 없었음. 페이지가 `addEventListener('cut'/'paste', ...)`로 걸면 통과되던 케이스 해결. `blockedEvents`에 `cut`, `paste` 추가.

부작용: 없음.

### 5. 차단 오버레이 div 무력화 (요청 항목 5)

신규 함수 `neutralizeBlockOverlay(element)`. `removeBlockingAttributes()`의 후보 루프 끝에서 호출.

판별 휴리스틱:
- `position: absolute | fixed` (인라인 또는 `style.position`)
- 의미 있는 텍스트 콘텐츠 없음 (`textContent.trim().length === 0`)

조건 만족 시 `pointer-events: none !important` 적용. 인라인 `on*` 핸들러가 있는 요소(즉, 사이트 자체가 차단기로 지정한 요소)만 대상이므로 오탐 위험 매우 낮음.

부작용: 진짜 광고/배너 div 중 같은 패턴은 영향받을 수 있으나, 광고 자체는 `on*` 핸들러로 표시되는 일이 드물어 실질적 영향 미미.

## 추가된 `-webkit-touch-callout: default` (보너스)

`injectSelectionStyle()`에 iOS Safari 컨텍스트 메뉴 차단 우회를 위한 `-webkit-touch-callout: default !important` 추가. Chrome에서는 무효지만 동일 엔진 위 모바일에서 효과.

## 변경 전후 비교

### 변경 전 (`blockedEvents` — 7개)

```js
['contextmenu', 'selectstart', 'copy', 'cut', 'dragstart', 'mousedown', 'mouseup']
```

### 변경 후 (`blockedEvents` — 13개)

```js
['contextmenu', 'selectstart', 'copy', 'cut', 'paste', 'dragstart',
 'dragover', 'drop', 'mousedown', 'mouseup',
 'touchstart', 'touchend', 'touchmove']
```

### CSS 추가

```css
*:not(input):not(textarea),
*:not(input):not(textarea)::before,
*:not(input):not(textarea)::after {
  /* ...existing user-select... */
  -webkit-user-drag: auto !important;
  -moz-user-drag: auto !important;
  -webkit-touch-callout: default !important;
}
img, a {
  -webkit-user-drag: auto !important;
  -moz-user-drag: auto !important;
  user-drag: auto !important;
}
```

### 신규 함수

```js
function neutralizeBlockOverlay(element) {
  if (!(element instanceof HTMLElement)) return;
  const declaredPosition = (element.style.position || '').toLowerCase().trim();
  if (declaredPosition !== 'absolute' && declaredPosition !== 'fixed') return;
  if ((element.textContent || '').trim().length > 0) return;
  element.style.setProperty('pointer-events', 'none', 'important');
}
```

## 검증

- `ocr review --repo .` 실행: 6건 중 의도된 변경 외 이슈 없음(content.js trailing whitespace 1건 수정 완료)
- 기존 단위/통합 테스트 없음(현재 MVP는 수동 테스트만). `tests/manual/blocked-page.html`은 기존 차단 시나리오용이므로 새 패턴 테스트 추가는 별도 작업 항목으로 분리
- 회귀 확인 필요 항목:
  1. 기존 우클릭/드래그/복사 동작 유지
  2. 입력 필드(input/textarea/select/contenteditable) 회피 동작 유지(미변경)

## 트라이파티 코디네이션

- `popup.js`, `background.js`, `content.js`의 `DEFAULT_SETTINGS = { enabled: true }` 셰이프는 미변경. 본 변경은 `content.js`에만 한정됨
- `manifest.json` 변경 없음(추가 권한 불필요, `host_permissions: ["<all_urls>"]`로 충분)

## 백업

`history/file-backups/`에 변경 직전 스냅샷 보관:
- `content.js_20260712_024332_win32_U-N-00658`
- `manifest.json_20260712_024332_win32_U-N-00658`
- `blocked-page.html_20260712_024332_win32_U-N-00658`

## 후속 작업 제안

1. `tests/manual/blocked-page.html`에 다음 시나리오 추가:
   - dragover/drop 차단 케이스
   - touch 이벤트 차단 케이스(데스크탑에선 시뮬레이션 한계, 모바일 실기기 테스트 권장)
   - `-webkit-user-drag: none` 이미지 케이스
   - 차단 오버레이 div 케이스
2. 사용자 매뉴얼/README에 새 차단 패턴 5종 설명 추가 (필요 시)
3. 차단 통계 카운터(어떤 패턴이 얼마나 걸렸는지) — 향후 옵션
