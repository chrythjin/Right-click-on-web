# Wave 1.2 Canvas OCR 전처리 파이프라인

## 작업 범위

- `ocr-image-utils.js`에 OCR 전처리의 제품 정본 픽셀 helper를 추가했다.
- `offscreen.js`가 crop clamp와 메모리 한도를 적용하고, 선택된 후보를 Tesseract worker에 전달하도록 연결했다.
- Node 단위 테스트가 픽셀 변환, Otsu, 후보 선택, retry ceiling 및 안전 치수 경계를 실제 제품 helper로 검증한다.

## 후보 정책

- 허용 profile은 `off`, `auto`, `grayscale`, `invert` 네 가지다.
- 긴 변이 900px 이하인 안전한 작은 입력만 2배 확대한다. 확대 뒤의 안전 한도를 초과하면 확대하지 않는다.
- dark background면 `invert`, 저대비면 `auto`, 작은 입력이면 `grayscale`, 나머지는 원본 `off`가 초기 후보가 된다.
- 첫 인식의 평균 confidence가 70 미만인 경우에만 대체 후보를 정확히 한 번 인식한다. 두 결과 중 높은 confidence를 채택하고 동점이면 최초 결과를 유지한다.

## 안전성과 호환성

- crop bounds clamp를 유지하고 0-area, 캡처 밖, 투명 빈 이미지, 16,000,000 픽셀 초과 crop에 명확한 오류를 반환한다.
- 전처리 픽셀 분석은 4,000,000 픽셀까지로 제한한다. metadata에는 profile 설정만 기록하고 이미지 또는 픽셀을 응답에 남기지 않는다.
- 성공 응답은 기존 `text`와 Wave 1.1의 `confidence`, `timingMs`, 실제 pixel `crop`을 유지하며, `preprocessing`에 선택된 profile 설정을 기록한다.
- 인식 오류는 기존 worker singleton을 폐기하지 않는다. 재생성은 worker 초기화 실패일 때만 발생한다.

## 검증

- `node --test .\tests\unit\*.test.js`
- `node --check .\ocr-image-utils.js`
- `node --check .\offscreen.js`
- `pwsh -NoProfile -File .\scripts\verify.ps1`

## 수동 QA 제한

- 이 작업 환경에는 정책상 사용할 수 있는 unpacked Chrome DevTools 대상이 없다. 실제 Chrome Canvas/OCR 비교는 배포 전 unpacked extension에서 별도로 수행해야 한다.
