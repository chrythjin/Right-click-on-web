# Popup Accessibility Live-Region Fix

## 변경 사항

- `popup.html`의 domain/preset 카드 래퍼에서 broad live-region semantics를 제거했다.
- `#sessionNotice`, `#syncUsage`, `#mainWorldNotice`를 일반 문단으로 변경하고 `is-hidden` 동작은 유지했다.
- 진단 카드의 accessible name을 `aria-label`로 지정하고 중복 `diagnosticTitle` 연결을 제거했다.
- 진단 안내 문구에 호스트명 포함 사실을 명시했다.

## 검증

- popup 관련 Node 단위 테스트 67개 통과
- `scripts/verify.ps1` 통과
- 전체 unit suite에서는 기존 `ocr-image-utils.test.js` 실패 1건이 확인됨: EXIF orientation 후보에 `auto`가 포함되어 기대값과 불일치. 이번 `popup.html` 변경과 무관함.
