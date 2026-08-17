# v0.10.1 — 테마 색상 변경 + 사이트 예외 등록 기능

**날짜:** 2026-08-17
**작업 유형:** 기능 추가 (UI + 저장 모델 + CSS 변수 시스템)

## 사용자 요청

1. 에디터가 있는 사이트에서 우클릭 메뉴가 무력화되는 문제 해결: "이 사이트는 예외로 추가" 기능.
2. 검은색 대신 밝은 네온 색 테마 선택 기능 ("글자 색이 잘 안 보여").

## 설계 결정

### 예외 사이트 = `domainSettings[host] = { enabled: false }` 등록

MAIN-world 패치는 동기 실행 + 스토리지 읽기 불가(memory #482, code 주석 44-52)로 사이트별로 끌 수 없다. ISOLATED/MAIN world 분리(메모리 #601)로 ISOLATED가 MAIN 패치를 해제할 수 없다.

따라서 가장 현실적이고 데이터 모델과 정합적인 해결은 "그 사이트에서 우회를 끈다": 사용자가 팝업에서 "이 사이트 예외로 추가" 버튼을 누르면 현재 호스트에 `{ enabled: false }` 항목을 만들고 ISOLATED가 enableUnlocker를 부르지 않게 한다. MAIN 패치는 여전히 동작하지만 페이지 측 contextmenu 리스너를 호출 못 하게 막고, 그 사이트의 우회는 비활성화되므로 브라우저 기본 우클릭 메뉴(잘라내기/복사/붙여넣기/검사)가 표시된다.

이 데이터 모델은 이미 `parseDomainSetting` + `isDomainEnabled`이 legacy boolean 형식을 허용하므로 추가 마이그레이션 불필요. UI만 새로 추가.

### 테마 색 = 글로벌 설정, 3종 (다크/네온/라이트)

- `dark` (기본) — 기존 Rosso Corsa 모터스포츠 다크 (현재 스타일).
- `neon` — 검은 배경 유지, 시안/마젠타/일렉트릭 민트 등 네온 강조 색 + 더 밝은 텍스트.
- `light` — 화이트 배경 + 다크 텍스트, 시안/마젠타 액센트.

저장 위치: `chrome.storage.sync.theme` (전역). `shared.js` STORAGE_DEFAULTS에 `theme: 'dark'` 추가. `resolveSettings`가 sync/local 병합하므로 별도 처리 불필요.

CSS는 `:root[data-theme="..."]` 변형 사용. `applyTheme(theme)`이 `documentElement.setAttribute('data-theme', safe)` 호출. 기본 시스템 다크/라이트 미디어 쿼리 위에 사용자 선택이 우선.

## 변경

### `shared.js`
- `THEME_DARK = 'dark'`, `THEME_NEON = 'neon'`, `THEME_LIGHT = 'light'`, `DEFAULT_THEME = 'dark'` 상수.
- `VALID_THEMES = Object.freeze([THEME_DARK, THEME_NEON, THEME_LIGHT])`.
- `resolveTheme(stored)` 순수 함수: 유효한 값 그대로 반환, 그 외는 `DEFAULT_THEME`로 폴백.
- `STORAGE_DEFAULTS.theme = DEFAULT_THEME` 추가.
- Node export에 `DEFAULT_THEME, VALID_THEMES, resolveTheme` 추가.
- 글로벌 `RIGHT_CLICK_ON_WEB_SHARED`에도 동일 노출.

### `popup.html`
- 테마 카드 �션 (`theme-card`) — 3개 radio 버튼 (라디오 그룹).
- 도메인 카드 안에 "이 사이트 예외로 추가(전체 OFF)" 버튼 (`addExceptionBtn`).

### `popup.css`
- `:root[data-theme="neon"]` 변수 오버라이드 (시안/마젠타/일렉트릭 민트, 더 밝은 텍스트).
- `:root[data-theme="light"]` 변수 오버라이드 (화이트 배경 + 다크 텍스트).
- `.theme-card`, `.theme-radio`, `.theme-radio.is-active`, `.exception-button` 스타일.
- 미디어 쿼리(`prefers-color-scheme: dark/light`)는 사용자 테마가 없을 때만 기본 적용.

### `popup.js`
- `applyTheme(theme)` / `syncThemeButtons()` 헬퍼.
- `handleThemeSelect(theme)` — 안전한 값으로 정규화 후 `documentElement.setAttribute('data-theme', ...)`, sync 쓰기.
- `handleAddCurrentSiteException()` — 현재 호스트에 `{ enabled: false, mode: 'ultimate', preset: 'safe', features: <default-features> }` 항목을 `safeSyncSet`으로 저장.
- 팝업 로드 시 저장된 theme 적용 + 라디오 버튼 동기화 + 도메인 카드 예외 버튼 바인딩.

### `options.html` / `options.js`
- 전역 설정 영역에 테마 카드 추가 (3개 radio).
- `applyTheme`/`syncThemeButtons`/`handleThemeSelect` 동일 로직.
- `loadState`에서 theme 로드 + 즉시 적용.

### `background.js`
- `initializeStorage`에서 `theme` 키도 정규화하여 저장.

### `tests/unit/settings-characterization.test.js`
- Node export 키 목록에 `DEFAULT_THEME`, `VALID_THEMES`, `resolveTheme` 추가.

### `tests/unit/theme.test.js` (신규)
- `resolveTheme`: 유효 값, 빈 문자열, null/undefined, 숫자, 객체, 배열 모두 DEFAULT_THEME 폴백.
- `VALID_THEMES`: 3개 값, 동결됨.
- `DEFAULT_THEME === 'dark'`.

## 검증

- `node --check` 5개 파일 통과 (shared.js, popup.js, options.js, background.js, tests/unit/theme.test.js)
- `node --test tests/unit/*.test.js` → **328 passed / 0 failed** (이전 322 + 신규 6)
- `.\scripts\verify.ps1` → 전체 PASS (구문, manifest 형태, 자산, 백그라운드 순서, git diff --check)

## 한계

- 예외 사이트 = 그 사이트에서 우회 전체 OFF. 사용자가 "에디터 메뉴만 살리고 싶다"는 더 세밀한 의도라면 추후 per-feature 토글이 필요(현재 `features` 스키마는 이미 지원).
- 테마는 글로벌만. 사이트별 테마 미지원.
- 네온/라이트 색은 시각적 검증 필요 — 자동화 헤드리스 검증 한계(memory #447). 매뉴얼 브라우저 QA 권장.

## 영향 파일

- `shared.js` (수정)
- `popup.html` (수정)
- `popup.css` (수정)
- `popup.js` (수정)
- `options.html` (수정)
- `options.js` (수정)
- `background.js` (수정)
- `tests/unit/theme.test.js` (신규)
- `tests/unit/settings-characterization.test.js` (수정)
- `tests/AGENTS.md` (수정)
- `AGENTS.md` (수정)

## 릴리스 패키징 (memory #716 계약)

소스 변경 후 `right-click-on-web-v0.10.0.zip` 재생성 완료.

- **명령:** AGENTS.md COMMANDS의 24개 항목 Compress-Archive (21 파일 + lib, langs, icons 디렉토리)
- **ZIP 항목:** 29개 (디렉토리 내부 포함)
  - 파일 21: manifest.json, shared.js, ocr-session-utils.js, ocr-history.js, toolbar-action-utils.js, image-context.js, keyboard-utils.js, ocr-image-utils.js, background.js, content.js, content-main.js, crop-overlay.js, crop-overlay.css, offscreen.html, offscreen.js, popup.html, popup.css, popup.js, options.html, options.css, options.js
  - lib/ 4: tesseract.min.js, worker.min.js, tesseract-core-lstm.wasm.js, tesseract-core-simd-lstm.wasm.js
  - langs/ 2: kor.traineddata.gz, eng.traineddata.gz
  - icons/ 2: icon128.png, icon512.png
- **SHA-256 검증:** ZIP 내부 29개 파일 전부 소스와 바이트 단위 일치 (Expand-Archive → Get-FileHash 비교, 불일치 0)
- **ZIP 자체 SHA-256:** `CF5F38D6BE10BA1EA768882ECEE134CB03EA2A856A40EDAB58DE82783E7DE38B`
- **크기:** 6,192,285 bytes (6.19 MB)
- **제외:** .git, tests/, docs/, popup-preview.html, README.md, assets/, history/, .opencode/
