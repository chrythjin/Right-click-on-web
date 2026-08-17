# OCR 화면 캡처 실패 메시지 원인별 한국어 안내

**날짜:** 2026-08-17 20:03
**작업 유형:** 구현 (오류 메시지 개선)
**버전 범위:** v0.10.0

## 배경

사용자가 `OCR 인식 실패: Taking screenshots has been disabled` 토스트를 목격.
원인은 `chrome.tabs.captureVisibleTab`이 크롬 자체 오류를 던지고, 익스텐션이 그
영문 메시지를 그대로 노출한 것. 시크릿 모드 미허용, OS/EDR/정책 차단, 보호된
페이지(chrome://, 웹 스토어) 등 여러 원인이 같은 영문 문자열로 떨어지므로
사용자가 원인과 탈출 경로를 알 수 없었다.

## 변경

### `ocr-session-utils.js`
- `classifyOcrCaptureFailure(rawMessage, context)` 순수 함수 추가. 크롬 오류
  문자열을 감지해 원인별 한국어 안내로 변환.
  - `screenshots has been disabled` + `incognito && !incognitoAllowed`
    → 시크릿 모드 안내 (`chrome://extensions`에서 허용 안내)
  - 동일 오류 + 비시크릿 또는 시크릿 허용됨
    → 정책/보안 프로그램 차단 안내
  - `cannot access` / `chrome://` / `web store` / `cannot be inspected`
    → 보호된 페이지 안내
  - `all_urls` / `permission` / `not allowed`
    → 권한 안내
  - 그 외 → 원문 보존 (디버깅 정보 손실 방지)
- `Object.freeze` export에 `classifyOcrCaptureFailure` 추가.

### `background.js`
- `describeOcrCaptureFailure(error, tab)` 비동기 헬퍼 추가. 탭의 `incognito`
  플래그와 `chrome.extension.isAllowedIncognitoAccess()` 결과로 컨텍스트를
  채워 `OCR_SESSION.classifyOcrCaptureFailure` 호출. API 조회 실패 시
  `incognitoAllowed: true` 기본값 유지 (warn 로그).
- `captureAndOcr`의 `chrome.tabs.captureVisibleTab` 호출을 try/catch로 래핑.
  캡처 예외를 분류된 한국어 메시지를 가진 `Error`로 재throw. 기존 `catch`
  블록이 `error.message`를 세션 상태/응답에 전달하므로 팝업·토스트·재인식
  경로 모두 자동으로 개선된 메시지를 받음.

### `tests/unit/ocr-capture-error.test.js` (신규)
- 순수 함수 경계 규칙에 따라 `classifyOcrCaptureFailure` 10개 케이스 단위
  테스트: 시크릿+미허용, 시크릿 아님, 시크릿+허용, 보호된 페이지, 웹 스토어,
  권한 부족, 알 수 없음, 빈 메시지, 비문자열, 컨텍스트 미제공.

### 문서
- `AGENTS.md` (root) 및 `tests/AGENTS.md`: 단위 테스트 파일 수 15 → 16,
  신규 파일 목록에 `ocr-capture-error.test.js` 추가.

## 한계 (사용자 질문 "모든 경우에 우회 가능?"에 대한 정직한 답변)

- 캡처 자체가 막힌 환경(시크릿 미허용, EDR/정책, 보호된 페이지)은 플랫폼
  제약이라 익스텐션 계층에서 우회 불가. 이번 변경은 우회가 아니라 **원인
  식별과 탈출 경로 안내**.
- 시크릿 미허용은 사용자가 `chrome://extensions`에서 한 번 설정하면 해결.
- EDR/정책/보호된 페이지는 안내만 가능하고 자동 해결 불가.
- 이미지 컨텍스트 메뉴 OCR은 캡처 대신 canvas 경로를 쓰므로 일부 캡처 차단
  환경에서도 동작하지만, 화면 영역 OCR은 여전히 캡처에 의존.

## 검증

- `node --check ocr-session-utils.js background.js tests/unit/ocr-capture-error.test.js` → 통과
- `node --test tests/unit/*.test.js` → 322 passed / 0 failed (기존 312 + 신규 10)
- `.\scripts\verify.ps1` → PASS (구문, manifest 형태, 자산, 백그라운드 순서, git diff --check)

## 영향 파일

- `ocr-session-utils.js` (수정)
- `background.js` (수정)
- `tests/unit/ocr-capture-error.test.js` (신규)
- `AGENTS.md` (수정)
- `tests/AGENTS.md` (수정)

---

# 후속: 참조 사이트 검토 (매뉴얼 QA harness + 바이패스 코드 정적 감사)

**날짜:** 2026-08-17 (같은 세션 후속)
**작업 유형:** 감사 + 수정

## 범위

사용자 요청 "다른 문제 없는지 참조 사이트 확인해서 고쳐줘" — 이 프로젝트에
"참조 사이트" 공식 정의가 없어 범위를 두 가지로 좁힘:
1. `tests/manual/blocked-page.html` (매뉴얼 QA harness, 15 시나리오)
2. 외부 실제 차단 사이트 — 프로필 정책으로 헤드리스 자동 진단이 막힘(memory #447/#614), 바이패스/OCR 코드 경로의 정적 감사로 접근

## 변경

### `tests/manual/blocked-page.html`
- **버전 불일치**: 시나리오 15 Canvas 텍스트 "v0.8.0 Local OCR Test" → "v0.10.0 Local OCR Test" (현재 릴리스 대상).
- **리스너 누적 버그**: 시나리오 14의 "Ctrl+C 차단 등록" 버튼이 가드 없이 매 클릭마다 `keydown` 리스너를 `document`에 누적 추가 → `keydownBlockerRegistered` 가드 추가로 1회만 등록되도록 수정. 여러 번 클릭해도 리스너가 쌓이지 않음.

### `background.js` — `imageContextCache` 탭 종료 정리
- 백그라운드 정적 감사(explore 에이전트) 결과 살아남은 유일한 실질적 버그.
- `imageContextCache`(Map, 키=`tabId:frameId`)가 탭 종료 시 정리되지 않아 닫힌 탭의 이미지 geometry가 SW 메모리에 잔존. 항목은 작지만 프로젝트 프라이버시 규칙(memory #712/#707)에 어긋나는 잠재적 데이터 잔존.
- `chrome.tabs.onRemoved` 리스너 추가: 탭 종료 시 해당 `tabId:` 접두사의 모든 프레임 항목을 `imageContextCache`에서 삭제.

## 감사 결과 (참고용)

explore 에이전트가 content.js, content-main.js, crop-overlay.js, offscreen.js, ocr-image-utils.js, image-context.js, ocr-session-utils.js, ocr-history.js, background.js, shared.js를 정적 감사. 24개 후보를 조사했으나 대부분 자기정정으로 "OK, that's fine" 귀결(예: MAIN/ISOLATED 이벤트 allowlist 동기화, capture-phase stopImmediatePropagation 세계 분리, Tesseract worker 재시도, normalizeCaptureMetadata preprocessingProfile 검증, imageContext 캐시 검증 로직 등). 살아남은 실질 버그는 imageContextCache 미정리 하나. 리스너 누적(harness 시나리오 14)은 harness 직접 점검에서 발견.

## 한계

- 외부 실제 차단 사이트 자동 진단은 프로필 정책으로 불가. 정적 감사가 잡을 수 있는 코드 경로 버그에 한정됨.
- 동적 런타임 버그(예: 특정 사이트의 타이밍 의존 경쟁)는 정적 감사로 잡지 못함 — 매뉴얼 브라우저 QA로 보완 필요(memory #447).

## 검증

- `node --check background.js` → 통과
- `node --test tests/unit/*.test.js` → 322 passed / 0 failed (변동 없음)
- `.\scripts\verify.ps1` → 전체 PASS (구문, manifest 형태, 자산, 백그라운드 순서, git diff --check)
- harness 스크립트 블록 추출 후 `node --check` → 통과

## 영향 파일 (후속)

- `tests/manual/blocked-page.html` (수정)
- `background.js` (수정)