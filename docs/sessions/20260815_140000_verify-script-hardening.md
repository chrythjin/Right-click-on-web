# 검증 스크립트 강화

## 변경 사항

- `scripts/verify.ps1`에 PowerShell 5.1 요구사항, StrictMode, 기존 디렉터리 `RootPath` 검증을 추가했다.
- `content_scripts`가 정확히 네 항목인지 확인하고, MV3 `service_worker`와 레거시 `scripts` 배경 선언을 모두 처리하도록 보강했다.
- `node --check` 실패 출력의 빈 결과 fallback과 파일 최소 크기 검사를 추가했다.
- 아이콘, Tesseract JavaScript, WASM 자산에 현실적인 최소 크기 검사를 적용했다.
- 작업 이슈 노트에 변경 요약을 기록했다.

## 검증

- `pwsh -NoProfile -File scripts/verify.ps1` 통과.
- 모든 JavaScript 구문 검사, manifest 검사, content script 검사, OCR 자산 검사, background 검사, offscreen 로컬 스크립트 검사 및 `git diff --check`가 PASS했다.
- `ocr review`는 저장소 전체 검토 중 외부 API 레이트 리밋으로 완료되지 않았다.

## F2 Final-Wave 결함 수정

- 배경 검증이 `service_worker`를 먼저 처리한 뒤 조기 반환하여 Firefox 호환 `scripts` 배열의 순서를 검사하지 않던 결함을 수정했다.
- `PSObject.Properties[...]` 존재 검사를 사용해 StrictMode에서 service-worker-only/scripts-only fixture도 안전하게 처리한다.
- fixture proof: dual-declared valid PASS, reordered scripts FAIL with `background scripts must load image-context.js and ocr-history.js before background.js`, service-worker-only PASS, scripts-only PASS.
