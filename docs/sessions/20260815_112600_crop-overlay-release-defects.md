# v0.10.0 crop-overlay release defect repair

## 목적

리뷰 과정에서 발견한 crop-overlay.js의 4가지 release 결함을 수정하고, 각 결함을 증명하는 VM 회귀 테스트를 추가한다. 이 작업은 자동 검증이 가능한 구현 항목이며, 실제 unpacked Chrome 수동 QA는 별도 게이트로 남는다.

## 수정한 결함

1. `RIGHT_CLICK_ON_WEB_KEYBOARD_UTILS` 누락/불완전 시 예외 대신 한국어 live status와 오류 toast
   - IIFE 로드 시점에 KU를 고정하지 않고, `getKU()`/`requireKU()`로 각 의존 핸들러가 호출 시점에 검증한다.
   - `requireKU()`가 null을 반환하면 호출부에서 안전하게 반환한다.
2. Enter 키 제출 시 `clampCropRect()` 먼저, 그 결과를 `isValidCropRect()`로 검증
   - 이전에는 원본 `cropState`를 검증해 뷰포트 밖 사각형이 그대로 제출될 수 있었다.
3. 단일 polite atomic live region
   - `tipElement`에서 `aria-live`를 제거하고, 내부 `.rcow-sr-instruction` span에만 `aria-live="polite" aria-atomic="true"`를 유지한다.
4. 종료 시 안전한 focus 복원
   - `body`/`html`이나 분리된 요소는 복원 대상에서 제외한다.
   - input/textarea/select/button/a[href]/[tabindex]/[contenteditable] 요소가 연결되어 있을 때만 `focus({ preventScroll: true })`로 복원한다.

## 검증

- `node --check crop-overlay.js`: 통과
- `node --test tests/unit/crop-overlay-regression.test.js`: 4/4 통과
- `node --test tests/unit/*.test.js`: 305/305 통과
- `pwsh -File .\scripts\verify.ps1`: 통과
- `git diff --check`: 통과
- 수정한 `crop-overlay.js`와 추가한 `tests/unit/crop-overlay-regression.test.js`에 대해 LSP/정적 진단: 오류 없음

## ZIP 재생성

수정으로 인해 ZIP과 소스가 불일치하므로 v0.10.0 release ZIP을 재생성했다.

- `right-click-on-web-v0.10.0.zip`: 29개 항목, 6,189,462 bytes
- ZIP 내 모든 파일을 현재 소스와 SHA-256으로 대조한 결과 불일치 0건
- ZIP 자체 SHA-256은 재생성 이전과 다르므로, release gate 문서에서는 새 해시를 기록해야 한다.

## 수동 QA 차단 상태

- 실제 unpacked Chrome에서의 키보드 이동, 스크린리더 live region 발화, 200% 줌, reduced-motion은 관찰하지 않았다. 환경에 연결된 Chrome extension target이 없어 별도 게이트로 남는다.
