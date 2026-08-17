# 작업 1.4 — side panel OCR 결과 편집 화면

## 작업 범위

- `options.html`, `options.css`, `options.js`에 OCR 결과 편집 UI를 추가했다.
- `<textarea>`를 사용해 한국어 IME를 지원하며, 원본/편집 텍스트 상태를 별도로 추적한다.
- 복사, 전체 선택, 공백 정리, 원본 복원 액션과 낮은 신뢰도 경고를 구현했다.
- 다음 업데이트의 검증된 재캡처를 위해 "다시 인식" 버튼은 비활성화하고 자연스러운 한국어 설명을 표시한다.
- 편집 중인 상태에서 새 OCR 결과가 들어오면 배너를 표시하고 사용자가 명시적으로 교체할 때만 덮어쓴다.
- 세션 저장소 미지원 시 비활성 상태로 표시한다.

## 안전 규칙 준용

- `latestOcrResult`와 `latestOcrStatus`는 여전히 분리 유지
- 들어온 결과가 현재 편집을 덮어쓰지 않음: `state.ocrIsDirty` 플래그 + `ocrPendingNewResultText`/`ocrDismissedResultText`로 보호
- 복사 실패, 빈 결과, 세션 API 미지원 케이스 처리

## 수정이전 결함

- `handleOcrCleanup()`이 편집 전체가 아닌 원본 텍스트 길이 기준으로suffix를 재구성하여 편집을 손상시켰다. 이제 전체 textarea 값을 직접 정리한다.
- `renderOcrResult()`가 `if (!state.ocrIsDirty || hasIncomingChange)`로 dirty 상태에서도 들어온 결과가 있으면 덮어썼다. 이제 dirty이면 덮어쓰지 않고 배너를 표시한다.
- `ocrConfidenceRow` element lookup이 HTML에 `id` 없이 crash를 유발했다. `id="ocrConfidenceRow"`를 추가했다.
- "Wave 1.5" 및 Chinese 혼용 텍스트가 UI에 포함되어 있었다. 자연스러운 한국어로 교체했다.
- 배너를 끈 후 상태만 변경되는 후속 `renderOcrResult()` 호출에서 배너가 다시 열렸다. `ocrDismissedResultText`를 추적하여 같은 텍스트에 대해 배너를 다시 표시하지 않는다.
- `computeOcrEditPendingState` 순수 헬퍼를 `ocr-session-utils.js`에 추출하여 단위 테스트 가능하게 했다.

## 테스트

- 17개 OCR 세션 유틸 테스트 (기존 5개 + 배너 상태 머신 7개 + 기존 5개)
- 전체 41개 테스트 통과
- `node --check` 모든 파일 통과
- PowerShell verifier 통과 (product checks)
