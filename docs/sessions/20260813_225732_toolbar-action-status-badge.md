# 툴바 액션 상태 배지

## 작업 범위

- 현재 탭의 effective 설정을 `OFF`, `L`, `U`, `S` 배지와 전체 한국어 액션 제목으로 표시한다.
- 전역/부모 도메인/세션 설정의 기존 `session > domain > global` 우선순위를 그대로 사용한다.
- 탭 활성화, URL 변경, local/sync 설정 변경, session 설정 변경 때 탭별 상태를 갱신한다.
- 편집 가능한 OCR 검토 UI와 같은 영역 OCR 재시도 흐름은 변경하지 않는다.

## 구현

- `toolbar-action-utils.js`에 순수 상태 매핑과 best-effort `chrome.action` 적용 경계를 추가했다.
- `background.js`는 `shared.js`의 `getHostname`, `resolveDomainKey` 기반 해석 함수, legacy boolean 및 Lite/Ultimate 정규화를 재사용한다.
- 탭별 갱신 버전으로 느린 이전 해석 결과가 더 최신 URL 또는 활성화 결과를 덮어쓰지 못하게 했다.
- Firefox background script 목록에도 순수 도우미를 선행 로드하도록 추가했다.

## 테스트

- 순수 도우미 테스트가 네 배지/제목 매핑과 누락·throwing action API 격리를 검증한다.
- Chrome API VM mock 통합 테스트가 global/domain/session 우선순위, 부모 도메인, legacy boolean, Lite/Ultimate 및 네 갱신 이벤트를 실제 배경 코드로 검증한다.
- 승인된 unpacked Chrome DevTools 대상이 없어 실제 브라우저의 두 탭 전환 수동 QA는 배포 전 게이트로 남긴다.
