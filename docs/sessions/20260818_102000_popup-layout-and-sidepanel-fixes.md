# 팝업 레이아웃 및 사이드 패널 오작동 조사 및 수정

**날짜:** 2026-08-18  
**작업 유형:** 결함 조사 및 수정 (CSS 레이아웃 안정화, Chrome MV3 Side Panel 제스처 위임, 테마 우선순위 정합성)

## 1. 보고된 문제점

1. **팝업 창 레이아웃 깨짐 / 극소화**
   - 확장 프로그램 아이콘 클릭 시 팝업이 아이콘 수준(극소 크기)으로 작게 뜨거나 스크롤/크기 계산이 비정상적으로 동작함.
2. **사이드 패널 클릭 시 새 창/새 탭으로 열림**
   - 팝업에서 "페이지 옆 패널에서 열기"를 클릭했을 때 사이드 패널이 아닌 `options.html`이 새 탭으로 열림.

---

## 2. 근본 원인 분석

### 2.1 팝업 극소화 및 레이아웃 깨짐
- **`popup.css`의 `html { overflow: hidden }` 및 `body { overflow: hidden }`**:
  - Chrome 확장 프로그램 팝업 렌더러는 `body`의 스크롤 크기를 기반으로 팝업 창의 높이를 동적으로 측정하여 윈도우 크기를 결정함.
  - `overflow: hidden`이 `html`이나 `body` 레벨에 있으면 Chrome이 팝업 내부의 실제 콘텐츠 높이를 측정하지 못하고 0 또는 최소 크기로 계산함.
- **`body { width: min(340px, 100vw) }`**:
  - 팝업 초기 렌더링 시점에 `100vw`가 0으로 계산되어 팝업 너비가 0 또는 극소 크기로 수축되는 Chrome 렌더링 타이밍 버그 발생.
- **해결책**:
  - `body`에 고정 `width: 340px`를 명시하고 `overflow`를 지정하지 않음(기본값 `visible`).
  - 스크롤은 내부 래퍼인 `.shell { max-height: 520px; overflow-y: auto; overflow-x: hidden; }`에서 단독으로 처리.

### 2.2 사이드 패널이 새 탭으로 폴백되는 문제
- **Chrome MV3 `chrome.sidePanel.open()` 사용자 제스처(User Gesture) 제약**:
  - `chrome.sidePanel.open()`은 사용자의 직접 클릭 이벤트 콜백 내에서 동기(Synchronous) 제스처 컨텍스트가 유지된 상태여야 정상 실행됨.
  - 기존 `popup.js`의 `handleOpenSidePanel()`은 `await chrome.tabs.query()` 비동기 호출을 먼저 수행한 뒤 `chrome.sidePanel.open()`을 호출하여 제스처 컨텍스트가 끊김.
  - 이로 인해 `sidePanel.open()`이 실패하고 `catch` 블록의 `handleOpenOptions()` -> `chrome.runtime.openOptionsPage()`로 폴백되어 새 탭이 열림.
- **해결책**:
  - `popup.js`에서 `chrome.runtime.sendMessage({ type: 'rcow:openSidePanel' })`로 background service worker에 위임.
  - `background.js`의 `onMessage` 핸들러에서 `chrome.sidePanel.open({ windowId })`를 호출하여 제스처 제약 없이 안전하게 사이드 패널을 열도록 수정.

### 2.3 테마 우선순위 및 CSS 충돌
- **`@media (prefers-color-scheme: light)`와 명시적 `data-theme="dark"` 충돌**:
  - OS/브라우저가 라이트 모드일 때 `@media (prefers-color-scheme: light)`의 `:root` 변수가 사용자가 선택한 `data-theme="dark"`를 덮어쓰는 문제.
  - `:root:not([data-theme])` 및 `:root[data-theme="dark"]`, `:root[data-theme="light"]` 셀렉터로 분리하여 사용자 명시 선택이 항상 시스템 설정을 우선하도록 정리.
- **`.status-card` 하드코딩 배경색**:
  - 라이트 테마 시 `.status-card`가 어두운 그라디언트로 남아있는 문제 수정.
- **`@media (prefers-reduced-motion)` 누락**:
  - `.theme-button`의 애니메이션 비활성화 목록 누락 보완.

---

## 3. 변경 상세

1. **`popup.css`**
   - `html`/`body`의 `overflow: hidden` 제거, `body { width: 340px; margin: 0; }` 설정.
   - `.shell`에서만 520px 높이 제한 및 `overflow-y: auto` 적용.
   - `:root[data-theme="dark"]` 명시 추가 및 `:root[data-theme="light"]` 테마 카드/배경 스타일 보강.
   - `@media (prefers-reduced-motion: reduce)`에 `.theme-button` 추가.
2. **`popup.js`**
   - `handleOpenSidePanel`에서 `rcow:openSidePanel` 메시지 전송 방식으로 전환.
   - L221 들여쓰기 오염 수정.
3. **`background.js`**
   - `chrome.runtime.onMessage` 리스너에 `rcow:openSidePanel` 액션 추가.
4. **`options.css`**
   - `body { min-height: 100vh; }`를 `min-height: 100%;`로 완화하여 사이드 패널 임베딩 시 레이아웃 안정성 확보.

---

## 4. 검증 결과

- `node --check popup.js background.js options.js shared.js` 통과
- `node --test tests/unit/*.test.js` 전 파일 PASS
- `.\scripts\verify.ps1` 릴리스 게이트 검증 전체 PASS
