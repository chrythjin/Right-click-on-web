# Right-click on Web

Chrome Manifest V3 기반의 no-build 확장 프로그램입니다. 일반적인 웹사이트의 우클릭, 텍스트 선택, 복사/잘라내기, 드래그 차단을 완화하는 MVP입니다.

## 기능 범위

- 우클릭 메뉴 차단 완화 (contextmenu)
- 텍스트 선택 차단 완화 (selectstart, user-select CSS)
- 복사 / 잘라내기 / 붙여넣기 차단 완화 (copy, cut, paste)
- 드래그 차단 완화 (dragstart)
- 텍스트 드롭 차단 완화 (dragover, drop) — 페이지 내 drop target의 preventDefault 우회
- 마우스 다운 / 업 차단 완화 (mousedown, mouseup)
- 모바일 길게 누르기 차단 완화 (touchstart, touchend, touchmove) — 이미지 저장 / 링크 복사 컨텍스트 메뉴 복원
- 이미지 / 링크 드래그 저장 차단 완화 (`-webkit-user-drag`, `user-drag` CSS 무효화)
- 차단 오버레이(투명 차단 div) 무력화 — `position: absolute/fixed` + 빈 텍스트 + 인라인 on* 핸들러를 가진 차단 div의 `pointer-events`를 무력화
- inline blocking attribute 제거 (`on*` 핸들러 8종)
- 동적으로 다시 추가되는 차단 attribute 감지 (MutationObserver)
- 팝업에서 전역 ON/OFF 토글
- 실행 통계 (`window.__rightClickOnWebStats`) — 제거/인터셉트/오버레이 무력화 카운터

## 제한 사항

이 확장은 모든 사이트의 100% 우회를 보장하지 않습니다. 이는 프로그램의 오류가 아니며, 웹 브라우저의 보안 표준 정책 및 기술적 특성으로 인한 근본적인 한계입니다. 다음의 경우에는 동작이 제한될 수 있습니다.

1. **이미지나 캔버스(Canvas) 내의 텍스트**
   - 글자가 텍스트 데이터가 아닌 이미지 파일이나 HTML5 Canvas 요소 내에 그림(픽셀) 형태로 표현된 경우, 드래그할 텍스트 자체가 존재하지 않으므로 선택할 수 없습니다.
2. **보안 처리된 외부 프레임 (Sandboxed iframe)**
   - 브라우저 보안 정책(Same-Origin Policy)이나 `sandbox` 속성으로 격리된 iframe 내부는 크롬 확장 프로그램의 자바스크립트가 접근할 수 없도록 브라우저 레벨에서 차단됩니다.
3. **캡슐화된 영역 (Closed Shadow DOM)**
   - 웹 표준 기술 중 하나인 Shadow DOM이 `closed` 모드로 구성된 경우 외부 스크립트나 CSS 주입이 원천적으로 차단됩니다.
4. **DRM 및 보호된 미디어 (Netflix 등)**
   - 금융 보안 페이지나 동영상 스트리밍 서비스 등 OS/브라우저 핵심 엔진 레벨에서 캡처 및 복사를 제어하는 특수 영역에는 작동하지 않습니다.
5. **독자적인 드래그/드롭 기능이 있는 웹 앱**
   - 보드게임, 지도, 특수한 에디터 등 자체적인 마우스 조작 인터페이스를 가진 웹 앱에서는 기본 드래그 기능 강제로 인해 정상적인 조작에 간섭이 발생할 수 있습니다.

## 권한 설명

- `storage`: 팝업의 ON/OFF 상태 및 통계를 저장합니다.
- `<all_urls>` host permission: 사용자가 방문하는 대부분의 페이지에 content script를 자동 적용하기 위해 필요합니다.

원격 서버 전송, 분석 추적, 원격 코드 로딩은 포함하지 않습니다.

## 로컬 설치

1. Chrome에서 `chrome://extensions`를 엽니다.
2. 오른쪽 위 **Developer mode**를 켭니다.
3. **Load unpacked**를 누릅니다.
4. 이 저장소 폴더를 선택합니다.

별도 빌드나 `npm install`은 필요하지 않습니다.

## 수동 테스트

`tests/manual/blocked-page.html`을 브라우저로 열어 다음을 확인합니다.

### 기본 시나리오

- 확장 ON: 우클릭 메뉴가 열리는지 확인 (섹션 1)
- 확장 ON: `user-select: none` 텍스트가 선택되는지 확인 (섹션 1)
- 확장 ON: 복사 차단이 완화되는지 확인 (섹션 1)
- 확장 OFF: 확장 CSS와 이벤트 개입이 제거되는지 확인

### 신규 시나리오 (v0.1.0 확장)

- 섹션 2: 이미지를 데스크탑으로 드래그해 저장 가능한지 확인
- 섹션 3: 선택한 텍스트를 드롭 영역에 드롭 가능한지 확인
- 섹션 4: 차단 오버레이 div 아래의 본문 텍스트 우클릭/선택 가능한지 확인
- 섹션 5: 모바일 실기기/모바일 에뮬레이션에서 이미지 길게 누르기 시 컨텍스트 메뉴 뜨는지 확인
- "동적 차단 요소 추가" / "동적 차단 오버레이 추가" 버튼으로 MutationObserver 동작 확인
- "실행 통계 보기" 버튼으로 `window.__rightClickOnWebStats` 노출값 확인

## 디자인 방향

팝업 UI는 공식 상표나 로고를 사용하지 않고, 레드/블랙/카본 질감/골드 액센트 기반의 프리미엄 모터스포츠 분위기로 구성했습니다.
