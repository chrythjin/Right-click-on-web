# 작업 1.5 - 같은 영역 OCR 재인식

## 작업 범위

- 최신 성공 OCR 세션 결과에 탭 ID, hostname, viewport-space crop rect, DPR, capture 시각, requestId, 허용된 전처리 profile을 안전한 원시값으로 기록했다.
- side panel의 다시 인식 버튼은 현재 active tab에서만 요청하고, background가 현재 탭과 원래 탭/hostname을 다시 대조한 뒤 fresh viewport를 요청한다.
- viewport/DPR, crop rect 범위, timestamp, 전처리 profile 검증이 모두 성공해야 `captureVisibleTab`을 호출한다.
- 허용된 재인식은 매번 새 PNG 캡처를 일시적으로 offscreen OCR에 전달한다. PNG/data URL은 session 결과나 재인식 요청에 보관하지 않는다.
- `requestId`를 OCR 상태와 결과에 기록하고 reducer가 낮은 ID의 늦은 loading, error, success 이벤트를 무시한다.

## 사용자 동작

- 저장된 OCR 결과에 안전한 영역 메타데이터가 있으면 "다시 인식" 버튼이 활성화된다.
- 탭, hostname, 화면 크기 또는 확대 비율이 달라졌으면 캡처하지 않고 한국어 오류를 표시한다. 탭 불일치 오류에는 URL이나 쿼리를 노출하지 않는다.
- 재인식은 직전 OCR이 자동으로 선택한 profile을 명시적으로 한 번 적용해 같은 영역의 결과를 비교할 수 있게 한다.

## 검증

- `node --test .\tests\unit\*.test.js`: tab/hostname/viewport/rect/DPR/profile 거부, fresh-capture request 생성, 역순 requestId 응답 보호를 포함한 전체 단위 테스트 통과.
- `node --check`로 변경 JavaScript 파일의 구문을 검사했다.
- `pwsh -NoProfile -File .\scripts\verify.ps1`와 `git diff --check`를 실행했다.
- JavaScript LSP는 이 저장소에 구성되어 있지 않아 blast radius/diagnostics를 사용할 수 없었다.

## 수동 QA 제한

- 승인된 unpacked Chrome DevTools 대상이 없어 실제 Canvas 영역의 off/auto/invert 재인식, 탭 전환 직전 캡처 차단, side panel 실시간 표시를 이 작업 환경에서 수행하지 못했다. 배포 전에 unpacked Chrome에서 해당 경로를 확인해야 한다.
