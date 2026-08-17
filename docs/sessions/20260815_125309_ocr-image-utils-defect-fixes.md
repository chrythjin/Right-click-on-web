# OCR 이미지 유틸리티 결함 수정

## 변경 사항

- no-op 픽셀 변환이 불필요한 `Uint8ClampedArray` 복사를 수행하지 않고 원본 버퍼를 반환하도록 수정했다.
- 첫 OCR 결과가 없을 때 대체 전처리를 실행하지 않도록 수정했다.
- 전처리 픽셀 예산을 안전한 전체 이미지 크기 assertion보다 먼저 검사하도록 수정했다.
- 누락되었거나 4바이트 RGBA 정렬이 아닌 버퍼의 grayscale 결과를 빈 배열로 반환하도록 수정했다.
- 네 가지 결함에 대한 회귀 테스트를 추가했다.

## 검증

- `node --check ocr-image-utils.js` 통과
- `node --test tests/unit/ocr-image-utils.test.js` 통과 (15개)
- `ocr-image-utils.js` 및 관련 테스트 파일 diagnostics 통과
- 전체 단위 테스트는 기존 `popup-diagnostic-report.test.js`의 직렬화 오류 메시지 테스트 1건을 제외하고 통과 (311/312)
- `ocr review`는 변경과 무관한 광범위한 기존 파일을 검토하는 중 rate limit으로 완료되지 않음
