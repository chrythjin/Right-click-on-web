# 코드베이스 전체 검토 및 개선 계획 (2026-08-18)

**날짜:** 2026-08-18  
**버전:** v0.10.2  
**작업자:** Antigravity  

## 1. 개요 및 검토 목적

Right-click on Web 확장프로그램의 전체 소스 코드(Manifest V3, Service Worker, Content Scripts, Offscreen WASM OCR, Popup, Options, CSS, Unit Tests)를 종합적으로 검토하여 잠재적 런타임 오류, 크로스 브라우저/OS 호환성 이슈, 테마 가독성 결함 및 사용자 경험(UX) 개선점을 도출하고 체계적인 개선 계획을 수립한다.

---

## 2. 정적 분석 및 테스트 결과

- **자동 검증 스크립트 (`scripts/verify.ps1`)**: 통과 (Syntax, Manifest 구조, 자산 존재, git diff 검사 완료)
- **단위 테스트 (`node:test`)**: 328개 테스트 전체 통과 (Pass: 328, Fail: 0)
- **MV3 아키텍처 준수성**:
  - `content-main.js`와 `content.js`의 MAIN vs ISOLATED 분리 및 순서 보장 양호
  - Service Worker 수명 주기와 비동기 `onMessage` 응답(`return true;`) 구조 양호
  - `storage.sync` 할당량 초과 시 `storage.local` 자동 폴백 및 락 처리 우수

---

## 3. 발견된 결함 및 개선 항목

### 1) [UI/버그] 라이트 테마(`data-theme="light"`) 선택 시 옵션/팝업 카드 가독성 결함
- **원인**: `popup.css`와 `options.css`의 라이트 테마 배경/카드 스타일이 `@media (prefers-color-scheme: light)`에만 집중되어 있음.
- **현상**: OS가 다크 모드인 사용자가 확장 설정에서 테마를 '라이트'(`data-theme="light"`)로 지정하면 글자색은 어두운 색으로 바뀌지만 `.options-section`, `.site-row`, `.ocr-original-text`, `.ocr-edited-text`, `.site-preset-select` 등의 배경은 어두운 색(`rgba(21, 21, 21, 0.78)`)으로 유지되어 텍스트를 식별하기 매우 어려움.
- **조치**: `:root[data-theme="light"]` 선택자를 명시적으로 정의하여 옵션 섹션, 사이트 행, OCR 텍스트 영역, 입력 요소가 밝은 배경과 높은 대비를 갖도록 개선.

### 2) [기능] 팝업 ↔ 옵션/사이드 패널 간 실시간 테마 변경 동기화 누락
- **원인**: `options.js` 및 `popup.js`의 `chrome.storage.onChanged` 리스너에서 `changes.theme` 감지가 누락됨.
- **현상**: 팝업에서 테마를 변경해도 열려 있는 옵션 페이지나 사이드 패널의 테마가 즉시 갱신되지 않음.
- **조치**: `storage.onChanged`에서 `changes.theme` 발생 시 `applyTheme()` 및 버튼 활성 상태를 즉시 동기화.

### 3) [UX 안정성] 옵션 페이지에서 설정 변경 시 OCR 편집 텍스트 초기화 방지
- **원인**: `options.js`의 `reload()` 함수가 `state.ocrEditedText = ''`, `state.ocrIsDirty = false`를 무조건 초기화함.
- **현상**: 상단 OCR 결과 편집창에서 텍스트를 수정하던 중 도메인 설정을 변경하면 `storage.onChanged` → `reload()`가 발생하여 사용자가 편집 중이던 텍스트가 날아감.
- **조치**: `reload()` 및 `onChanged` 시 `state.ocrIsDirty` 상태인 경우 사용자의 편집 텍스트를 유지하고, 도메인/전역 설정 변경 시에는 `renderSites()`만 부분 갱신하도록 분리.

### 4) [방어 코드] `crop-overlay.js` 클립보드 복사 폴백 시 `document.body` null 가드
- **원인**: `crop-overlay.js:500`의 `copyToClipboard` 폴백에서 `document.body.appendChild(ta)` 직접 호출.
- **조치**: `(document.body || document.documentElement).appendChild(ta)`로 안전하게 수정.

---

## 4. 개선 작업 계획

1. **CSS 테마 보강 (`popup.css`, `options.css`)**
   - `:root[data-theme="light"]` 하위의 `.options-section`, `.site-row`, `.ocr-original-text`, `.ocr-edited-text`, `.site-preset-select`, `.advanced-toggle-button` 등 라이트 스타일 명시적 선언
   - `:root[data-theme="neon"]` 테마와의 조화성 점검
2. **테마 동기화 강화 (`options.js`, `popup.js`)**
   - `storage.onChanged`에서 `changes.theme` 처리 추가
3. **OCR 편집 상태 보존 (`options.js`)**
   - `reload()` 시 `state.ocrIsDirty` 보존 로직 추가
4. **안전성 보강 (`crop-overlay.js`)**
   - 클립보드 textarea 부착 시 root fallback 처리
5. **검증 및 단위 테스트**
   - 기존 17개 단위 테스트 및 `verify.ps1` 재실행
   - 테마 동기화 및 렌더링 검증 테스트 추가
