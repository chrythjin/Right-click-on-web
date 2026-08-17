# 작업 2.4 popup 프리셋 UI

**날짜:** 2026-08-15 02:30 (초안), 2026-08-15 03:00 (retry — 7개 결함 수정)
**버전:** v0.9.1 (task 2.4)
**범위:** popup.html, popup.css, popup.js, keyboard-utils.js, tests/unit/popup-preset-ui.test.js

## 개요

작업 2.1의 canonical feature profile 스키마를 사용해 popup에 3개 primary compatibility preset UI를 구현했다. 기존 Lite/Ultimate CSS-strength 축은 그대로 유지하고, 별도의 "사이트 호환성" 축으로 Safe/Complete/Upload-safe 프리셋을 추가했다. session > domain > global 우선순위와 "session은 enabled만 덮어쓰고 profile은 matched domain 또는 기본 complete를 따른다"는 계약을 UI에 정확히 반영했다.

## Retry (2026-08-15 03:00) — 7개 계약/동시성 결함 수정

초안 구현이 source review에서 7개 결함으로 거절되어 동일 세션에서 수정했다:

1. **Parent inheritance**: `computePresetState`가 `state.domainEntry`(exact-host only) 대신 `state.matchedKey` + `state.domainSettings[matchedKey]`에서 profile을 파생하도록 수정. parent domain 상속 시 content script와 lockstep.
2. **Profile preservation**: `handleDomainToggle`/`handleModeSelect`가 preset/features를 silent reset하던 것을 `computeProfilePreservingEntry()`로 교체. matched entry의 preset/features 보존.
3. **Options-only display**: selection/media-safe/custom을 complete로 fallback하던 것을 `classifyPreset()`으로 교체. options-only preset은 radio highlight 없이 honest "고급" hint 표시.
4. **Session editability**: session active 시 preset 버튼을 disabled하던 것을 제거. session은 enabled만 덮어쓰고 profile은 계속 govern하므로 preset 선택은 항상 가능.
5. **Real promise-tail queue**: mutable in-flight promise를 promise-tail queue로 교체. call order 보장, concurrent caller가 tail을 덮어쓰지 못함.
6. **Full canonical snapshot**: `computePresetEntry`가 `{ enabled, mode, preset, features }` full canonical snapshot을 반환하도록 수정. 9개 feature boolean 포함.
7. **Test drift**: rapid-write test가 popup.js queue를 직접 시뮬레이션하던 것을 실제 `writeDomainSettings` 함수를 VM에서 실행하는 harness로 교체. deferred async write delay 테스트로 call-order 보장 증명.

## Second retry (2026-08-15 03:30) — 2개 접근성/문서 결함 수정

Atlas source review에서 first retry 후 2개 잔여 결함 발견:

1. **Roving tabindex 접근성 결함**: options-only profile (selection/media-safe/custom)일 때 모든 preset 버튼이 `tabindex=-1`이 되어 Tab으로 radiogroup에 진입할 수 없었다. WAI-ARIA radiogroup은 enabled radio가 있으면 Tab-reachable item이 있어야 한다. 수정: `computePresetTabindex()` 순수 헬퍼 추가 — active preset이 없으면 Complete 버튼이 `tabindex=0` focus anchor 역할 (aria-checked=false, .is-active 없음 유지).
2. **키보드 핸들러 focus anchor 추적**: `handlePresetKeydown`이 active button 기준으로 navigation하던 것을 focus anchor (tabindex=0 버튼) 기준으로 변경. options-only 상태에서 Complete anchor에서 Arrow/Home/End navigation이 정상 작동하며, navigation 후 old anchor의 tabindex를 -1로 clear하여 Tab entry point가 하나만 유지.
3. **세션 문서 stale 섹션**: lines 42-66이 여전히 `computePresetFromProfile`, 5개 helper, session-blocked writes, 26 tests, simulated queue를 설명하던 것을 최종 8개 helper, session-editable, full snapshot, parent inheritance, promise-tail queue, 52 tests로 전면 재작성.

## Third retry (2026-08-15 04:00) — 3개 핸들러/테스트/문서 결함 수정

Atlas source review에서 second retry 후 3개 잔여 결함 발견:

1. **핸들러 currentTarget 무시**: `handlePresetKeydown`이 항상 `tabindex=0` anchor에서 navigation을 시작하여 `event.currentTarget`을 무시했다. pointer-clicked 또는 programmatically focused `tabindex=-1` radio가 async storage/render cycle 전에 keydown을 받으면, stored tabindex는 stale 상태이므로 navigation이 잘못된 시작점에서 출발한다. 수정: `resolveCurrentPreset(focusedEl, buttons, KB)` 순수 헬퍼 추가 — currentTarget > tabindex anchor > .is-active > Complete 우선순위로 시작 preset 결정. 핸들러는 `resolveCurrentPreset(event.currentTarget, buttons, KB)` 호출.
2. **테스트가 keyboard-utils만 테스트**: 4개 keyboard nav 테스트가 `keyboard-utils.getNextPresetFromKeydown()`만 직접 호출하여 popup 핸들러의 decision path를 전혀 검증하지 않았다. 수정: `resolveCurrentPreset` 5개 테스트 (currentTarget 우선, anchor fallback, active fallback, Complete fallback, foreign element 무시) + handler decision path 6개 테스트 (resolveCurrentPreset → getNextPresetFromKeydown 조합으로 Arrow/Home/End from options-only anchor, currentTarget priority changes navigation)로 교체. 총 11개 테스트가 실제 핸들러 decision path를 검증.
3. **세션 문서 helper count 불일치**: design decision 5가 "7개 순수 헬퍼"라고 쓰면서 implementation list는 8개를 나열했다. 수정: 모든 helper count를 9개로 통일 (`resolveCurrentPreset` 추가로 8→9). test count 52→59, full suite 191→198로 갱신.

## 변경 파일

### keyboard-utils.js
- `PRESET_SAFE`, `PRESET_COMPLETE`, `PRESET_UPLOAD_SAFE` 상수 및 `POPUP_PRESET_ORDER` 배열 추가
- `getNextPresetFromKeydown()` 함수 추가: 3-preset radiogroup용 roving tabindex navigation (Arrow/Home/End, wrap-around)
- export 객체에 새 상수와 함수 추가

### popup.html
- mode-card 섹션 뒤에 `preset-card` 섹션 추가
- 3개 preset 버튼 (안전/완전/업로드 보호)을 `role="radiogroup"` 안에 배치
- `presetHint` 단락과 `effectiveSource` 상태 줄 추가
- 한국어 레이블 유지

### popup.css
- `.preset-card`, `.preset-toggle`, `.preset-button`, `.preset-hint`, `.effective-source` 스타일 추가
- 기존 mode-card 패턴과 동일한 motorsport red/black/gold 색상 체계
- `prefers-reduced-motion` 블록에 `.preset-button` 추가
- 버전별 섹션 구분자 주석(`/* ---- v0.9.1 additions ---- */`) 유지

### popup.js
- `state` 객체에 `effectivePreset`, `enabledSource` 필드 추가
- `elements` 객체에 preset 버튼, hint, effectiveSource 요소 추가
- 순수 헬퍼 함수 9개 추가 (DOM/chrome.* 의존 없음, VM 테스트 가능):
  - `classifyPreset(parsedPreset, SHARED)`: preset id를 popup preset vs options-only로 분류. options-only는 `isPopupPreset: false`, `displayPreset: null` 반환
  - `computePresetState(state, SHARED)`: `state.matchedKey` + `state.domainSettings[matchedKey]`에서 effective preset, source, hasMatchedEntry, canSelect 계산. parent inheritance 지원. session active여도 `canSelect: true`
  - `computePresetEntry(currentDomainEntry, presetId, SHARED)`: preset 선택 시 write할 domain entry 계산. `parseDomainSetting(raw)`을 통과시켜 `{ enabled, mode, preset, features }` full canonical snapshot 반환 (9개 feature boolean 포함)
  - `computeProfilePreservingEntry(currentDomainEntry, overrides, SHARED)`: mode/toggle 변경 시 matched entry의 preset/features를 보존하고 enabled/mode만 override
  - `computeEffectiveSourceText(source, displayPreset, isPopupPreset, hasMatchedEntry, SHARED)`: 활성 출처 줄 텍스트 생성. options-only preset은 "선택 (고급)" 등 advanced label 사용
  - `computePresetTabindex(buttonId, isActive, isPopupPreset, canSelect, SHARED)`: roving tabindex 정책. active preset은 tabindex=0, options-only profile은 Complete 버튼이 tabindex=0 focus anchor (aria-checked=false 유지)
  - `resolveCurrentPreset(focusedEl, buttons, KB)`: 키보드 navigation 시작 preset 결정. currentTarget > tabindex anchor > .is-active > Complete 우선순위. pointer-clicked tabindex=-1 radio가 async render 전 keydown을 받는 race condition 해결
  - `presetLabelKorean(presetId)`: popup preset id → 한국어 레이블
  - `advancedPresetLabelKorean(presetId)`: options-only preset id → 한국어 고급 레이블
- `loadState()`에 `computePresetState()` 호출 추가
- `render()`에 preset 버튼 active/aria/tabindex/disabled 상태 렌더링 추가. `computePresetTabindex()`로 tabindex 정책 적용
- `handlePresetSelect(presetId)` 핸들러 추가: session active 여부와 무관하게 항상 write (session은 enabled만 덮어쓰고 profile은 계속 govern)
- `handleDomainToggle`/`handleModeSelect`: `computeProfilePreservingEntry()` 사용하여 preset/features 보존
- `handlePresetKeydown` 키보드 핸들러: `resolveCurrentPreset(event.currentTarget, buttons, KB)`로 시작 preset 결정. currentTarget 우선, tabindex anchor는 fallback. navigation 후 old anchor tabindex를 -1로 clear
- `writeDomainSettings`: promise-tail queue (`let writeDomainSettingsTail = Promise.resolve()` + `.then()` chain)로 call order 보장
- `module.exports`에 순수 헬퍼 9개 추가

### tests/unit/popup-preset-ui.test.js (신규)
- 59개 테스트:
  - `classifyPreset`: 3개 popup preset 매핑, options-only (selection/media-safe/custom) null displayPreset
  - `computePresetState`: no hostname, no matched entry, exact-host entry, parent-domain matchedKey, parent-domain options-only, custom/media-safe honest display, session active canSelect=true, session+no entry
  - `computePresetEntry`: unsaved hostname full canonical {enabled,mode,preset,features}, existing entry 보존, 9개 feature boolean, legacy boolean
  - `computeProfilePreservingEntry`: toggle enabled 보존, mode change 보존, null에서 default complete, parent custom 보존
  - `computeEffectiveSourceText`: session+domain, session+default, domain, global, options-only advanced label, custom advanced label
  - `computePresetTabindex`: active preset tabindex=0, non-active -1, options-only Complete anchor tabindex=0, non-Complete -1, disabled -1, exactly one tabindex=0 (popup preset), exactly one tabindex=0 (options-only), no hostname all -1
  - `resolveCurrentPreset`: currentTarget 우선 (anchor 무시), tabindex anchor fallback, .is-active fallback, Complete fallback, foreign element 무시
  - `presetLabelKorean`/`advancedPresetLabelKorean`: 3개 popup preset, options-only preset
  - real product queue: rapid safe→complete→upload-safe call-order serialization, deferred async write order, interleaved hostname sibling 보존
  - handler decision path: ArrowRight/ArrowLeft/Home/End from options-only Complete anchor (resolveCurrentPreset → getNextPresetFromKeydown), currentTarget priority changes navigation (safe/upload-safe clicked before async render)
  - `parseDomainSetting` round-trip: 3개 preset별 canonical features snapshot, custom features 보존

## 핵심 설계 결정

1. **preset vs mode 분리**: mode는 CSS 강도(Lite/Ultimate), preset은 feature profile 호환성(Safe/Complete/Upload-safe). 두 축을 혼동하지 않고 별도 섹션으로 배치했다.

2. **canonical schema 재사용**: `shared.js`의 `parseDomainSetting()`이 반환하는 `preset` 필드를 직접 사용하고, `PRESET_FEATURES` 맵이 canonical snapshot의 정본이다. popup에서 별도의 profile-to-preset 매핑이나 snapshot 생성 함수를 만들지 않았다.

3. **session 중 preset 편집 허용** (retry 수정): session은 enabled만 덮어쓰고 profile은 계속 tab을 govern하므로, session 활성 중에도 preset 선택이 가능하다. `canSelect`는 항상 true (hostname이 있을 때). `effectiveSource` 텍스트로 "활성화만 세션이 덮어쓰며 프로필은 도메인(또는 기본 완전)을 따릅니다"라고 명시한다.

4. **3개 preset 제한 + options-only honest display** (retry 수정): popup에는 safe/complete/upload-safe 3개만 노출하고 selection/media-safe/custom은 options(작업 2.5)에 둔다. `classifyPreset()`이 options-only preset을 `isPopupPreset: false`로 분류하고, render에서 어떤 radio도 highlight하지 않으며 "현재 프로필: 선택 (고급) — 옵션 페이지에서 변경 가능"이라는 honest hint를 표시한다.

5. **순수 헬퍼 추출**: `computeMainWorldNotice`의 VM 테스트 패턴을 따라 9개 순수 헬퍼를 추출했다. DOM/chrome.* 의존 없이 SHARED 모듈만 매개변수로 받아 단위 테스트 가능하다.

6. **Parent inheritance** (retry 추가): `computePresetState`는 `state.matchedKey` + `state.domainSettings[matchedKey]`에서 profile을 파생한다. matchedKey는 parent domain일 수 있으므로 content script의 resolution과 lockstep이 된다.

7. **Profile preservation** (retry 추가): `handleDomainToggle`/`handleModeSelect`는 `computeProfilePreservingEntry()`를 사용하여 matched entry의 preset/features를 보존하고 enabled/mode만 override한다.

8. **Promise-tail queue** (retry 추가): `writeDomainSettings`는 `let writeDomainSettingsTail = Promise.resolve()`에 `.then()` chain하여 call order를 보장한다. 이전 mutable in-flight promise는 concurrent caller가 tail을 덮어쓸 수 있었으나 새 구조는 각 caller가 현재 tail을 capture하고 chain한다.

## 검증

### 자동 검증 (통과 — third retry 후)
- `node --test tests/unit/popup-preset-ui.test.js`: 59개 테스트 통과 (초안 26개 → first retry 40개 → second retry 52개 → third retry 59개)
- `node --test tests/unit/*.test.js`: 전체 198개 테스트 통과 (기존 139 + 신규 59)
- `node --check popup.js keyboard-utils.js shared.js`: 구문 검사 통과
- `scripts/verify.ps1`: 7개 검사 통과 (JavaScript syntax, manifest parse, MAIN-first content scripts, blocked-event allowlist, required assets, offscreen scripts, git diff --check)
- `git diff --check`: whitespace 오류 없음

### 수동 QA (미실행)
- 승인된 unpacked Chrome DevTools 대상이 없어 실제 popup UI 동작(버튼 클릭, 키보드 탐색, 시각적 active state, effectiveSource 텍스트 렌더링)은 직접 관찰하지 못했다.
- 순수 helper 단위 테스트와 정적 검증만으로 UI 동작 완료를 주장할 수 없으며, 배포 전 수동 QA 게이트로 남는다.

### LSP blast radius (미실행)
- `agent-lsp` client가 미초기화 상태로 blast radius 분석을 실행할 수 없었다. AGENTS.md에 문서화된 제약(LSP server가 이 repo에 root되지 않음)이며, built-in diagnostics와 정적 분석으로 대체했다.

## 제약 사항

- `content-main.js` semantics, MAIN allowlist, manifest permissions, profile schema는 수정하지 않았다.
- Lite/Ultimate selector는 그대로 유지했다.
- options advanced switches, diagnostics, v0.10 work, packaging, commit은 이 작업 범위 밖이다.
- 의존성, 원격 코드, telemetry, network call, permission 추가 없음.