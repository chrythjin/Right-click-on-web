# 작업 3.2 이미지 OCR 실행과 결과 UI 통합

## 목적

이미지 context-menu OCR을 수동 영역 OCR과 동일한 `captureAndOcr`/offscreen OCR/session result/edit/clipboard/rerun 경로에 연결한다. 이미지 원본 URL이나 바이트는 읽거나 저장하지 않고, task 3.1에서 계산한 현재 화면의 visible rendered rect만 사용한다.

## 구현

- `region`/`image` canonical source allowlist와 malformed/legacy `visible-tab`의 안전한 `region` 정규화를 `ocr-session-utils.js`에 추가했다.
- crop overlay producer와 background runtime handler가 `region` source를 전달하고, image context-menu 경로가 같은 `captureAndOcr` 함수에 `image` source와 task 3.1 rect를 전달한다.
- session result metadata와 rerun request에 source를 allowlist 방식으로 보존했다. rerun은 저장된 이미지 데이터가 아니라 현재 탭의 새 `captureVisibleTab` 호출만 사용한다.
- options/side-panel 결과 메타에 `출처 이미지/영역`을 표시하고, image 결과에만 현재 화면에서 보이는 이미지 부분만 인식된다는 접근 가능한 Korean 안내를 표시한다.

## 검증

- `node --test tests/unit/*.test.js`: 276개 통과.
- 변경 JavaScript `node --check`: 통과.
- `& .\scripts\verify.ps1 -RootPath (Get-Location)`: 8개 검사 통과.
- `git diff --check`: exit 0. 기존 줄바꿈 변환 경고만 출력되었다.
- 승인된 unpacked Chrome DevTools target이 없어 실제 Chrome context-menu/side-panel 수동 QA는 수행하지 못했다.
- `ocr review`는 외부 분석 서비스의 rate limit으로 시간 초과되어, 결과를 검토 근거로 사용하지 않았다.
