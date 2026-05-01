# Right-click on Web

Chrome Manifest V3 기반의 no-build 확장 프로그램입니다. 일반적인 웹사이트의 우클릭, 텍스트 선택, 복사/잘라내기, 드래그 차단을 완화하는 MVP입니다.

## 기능 범위

- 우클릭 메뉴 차단 완화
- 텍스트 선택 차단 완화
- 복사/잘라내기/드래그 차단 완화
- inline blocking attribute 제거
- 동적으로 다시 추가되는 차단 attribute 감지
- 팝업에서 전역 ON/OFF 토글

## 제한 사항

이 확장은 모든 사이트를 100% 우회한다고 보장하지 않습니다. 다음 경우에는 동작하지 않거나 제한될 수 있습니다.

- 이미지나 canvas에 그려진 텍스트
- DRM 또는 protected media
- 서버 사이드에서 텍스트를 제공하지 않는 페이지
- closed Shadow DOM 내부
- 강하게 sandbox 처리된 iframe
- 사이트 고유 기능과 충돌하는 드래그/에디터/게임 UI

## 권한 설명

- `storage`: 팝업의 ON/OFF 상태를 저장합니다.
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

- 확장 ON: 우클릭 메뉴가 열리는지 확인
- 확장 ON: `user-select: none` 텍스트가 선택되는지 확인
- 확장 ON: 복사 차단이 완화되는지 확인
- 확장 OFF: 확장 CSS와 이벤트 개입이 제거되는지 확인

## 디자인 방향

팝업 UI는 공식 상표나 로고를 사용하지 않고, 레드/블랙/카본 질감/골드 액센트 기반의 프리미엄 모터스포츠 분위기로 구성했습니다.
