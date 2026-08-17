# Wave 1.1 OCR 응답 계약 확장

## 작업 범위

- `offscreen.js`가 Tesseract 인식 결과를 기존 `text`와 구조화된 OCR 메타데이터로 함께 반환하도록 확장했다.
- `background.js`가 성공 응답을 재구성하지 않고 그대로 전달해 이후 결과 소비자가 메타데이터를 받을 수 있게 했다.
- 제품 `ocr-image-utils.js` 정본 seam과 Node 단위 테스트로 confidence 집계 규칙을 고정했다.

## 계약

성공 응답은 기존 `text`를 유지하고 다음 필드를 추가한다.

- `confidence`: 빈 문자열 단어를 제외한 평균, 낮은 confidence 단어 수, threshold
- `preprocessing`: 현재 원본 인식임을 나타내는 `off` profile
- `timingMs`: crop과 인식에 걸린 반올림 밀리초
- `crop`: 실제 canvas crop의 픽셀 너비와 높이

평균 confidence는 각 유효 단어를 0~100으로 clamp한 뒤 반올림한다. 유효 단어가 없으면 평균은 `0`이고 낮은 confidence 단어 수는 `0`이므로 NaN을 만들지 않는다.

## 호환성과 제한

- `crop-overlay.js`는 계속 `response.text`만 읽으므로 새 필드가 없는 구형 성공 응답도 그대로 처리한다.
- recognition 실패는 기존처럼 오류 응답만 반환하며, 이 변경은 worker singleton을 폐기하지 않는다.
- Wave 1.2 전처리 알고리즘, 재시도, persistence/UI는 구현하지 않았다.

## 검증

- `node --test .\tests\unit\*.test.js`
- `node --check .\ocr-image-utils.js`; `node --check .\offscreen.js`; `node --check .\background.js`
- `pwsh -NoProfile -File .\scripts\verify.ps1`
