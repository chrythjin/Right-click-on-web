# Right-click on Web MVP 구현 세션

## 변경 요약

- Chrome Manifest V3 기반 no-build 확장 프로그램 골격을 생성했습니다.
- `storage`와 `<all_urls>` host permission만 사용하는 최소 권한 설계를 적용했습니다.
- content script에서 일반적인 우클릭, 선택, 복사/잘라내기, 드래그 차단을 완화하도록 구현했습니다.
- popup UI는 레드/블랙/카본/골드 기반의 프리미엄 모터스포츠 스타일로 구성했습니다.
- 재현 가능한 수동 검증을 위해 차단 테스트 페이지를 추가했습니다.

## 생성 파일

- `manifest.json`
- `background.js`
- `content.js`
- `popup.html`
- `popup.css`
- `popup.js`
- `README.md`
- `tests/manual/blocked-page.html`
- `docs/sessions/20260502_001056_right-click-extension-mvp.md`

## 핵심 구현 결정

- 빌드 도구 없이 vanilla JavaScript, HTML, CSS만 사용했습니다.
- MV3 static content script를 `document_start`와 `all_frames: true`로 설정했습니다.
- OFF 상태에서는 삽입 CSS를 제거하고, `AbortController`로 이벤트 리스너를 일괄 해제하며, `MutationObserver`를 중단합니다.
- MAIN world injection, `eval`, 원격 코드 로딩, 불필요한 `activeTab`/`scripting` 권한은 사용하지 않았습니다.
- 공식 Ferrari 상표나 로고는 사용하지 않고 색감과 질감만 모터스포츠풍으로 표현했습니다.

## 검증 결과

- `manifest.json`은 PowerShell `ConvertFrom-Json`으로 파싱되며 `manifest_version: 3`, `permissions: ["storage"]`, `host_permissions: ["<all_urls>"]`를 확인했습니다.
- 필수 파일 존재 검증을 통과했습니다.
- LSP diagnostics에서 JavaScript 파일 3개 기준 오류 0개를 확인했습니다.
- `node --check background.js`, `node --check content.js`, `node --check popup.js` 문법 검사를 통과했습니다.
- 위험 패턴 검색에서 실제 코드의 `activeTab`, `scripting`, `eval`, `new Function`, TypeScript suppression 패턴이 발견되지 않았습니다.
- 5개 후속 리뷰(목표 적합성, QA, 코드 품질, 보안, 누락 컨텍스트)가 모두 PASS 또는 PASS with caveat로 완료됐고 차단 이슈는 없었습니다.
- Chrome `Load unpacked`, 팝업 렌더링, 실제 웹페이지 주입 동작은 사용자의 로컬 Chrome 런타임에서 수동 확인이 필요합니다.

## 알려진 제한

- 모든 사이트 100% 우회를 보장하지 않습니다.
- 이미지/canvas 텍스트, DRM, 서버 사이드 제한, closed Shadow DOM, sandboxed iframe에는 제한이 있습니다.
- 전역 이벤트 개입은 일부 드래그 UI, 에디터, 게임형 페이지와 충돌할 수 있어 팝업 OFF 토글을 제공합니다.
