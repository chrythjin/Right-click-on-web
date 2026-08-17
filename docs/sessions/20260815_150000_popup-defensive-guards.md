# 팝업 방어적 가드 결함 수정

## 변경 사항

- `popup.js`의 keyboard-utils 초기화 결과를 검증하고, 유틸리티가 없거나 필수 함수가 아니면 경고 후 화살표 키 탐색을 건너뛰도록 했다.
- 진단 보고서 serializer가 feature map, 통계 counter, resolution source/mode/preset의 페이지 소유 getter를 안전하게 읽도록 했다.
- 진단 직렬화 실패와 클립보드 복사 실패를 별도의 한국어 상태 메시지로 구분했다.
- 팝업 단위 테스트에 누락된 keyboard-utils와 throwing Proxy 회귀 사례를 추가했다.

## 검증

- `node --check popup.js`
- `node --test tests/unit/popup-diagnostic-report.test.js tests/unit/popup-preset-ui.test.js` (70 passed)
- `node --test tests/unit/*.test.js` (312 passed)
- 변경 파일 LSP diagnostics: 오류 없음

`ocr review`는 저장소 전체의 기존 dirty 변경을 함께 스캔하는 과정에서 외부 검토 서비스의 rate limit과 제한 시간 초과로 완료되지 않았다.
