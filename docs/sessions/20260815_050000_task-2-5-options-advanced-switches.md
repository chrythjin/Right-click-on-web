# 작업 2.5 options 고급 기능 스위치

**날짜:** 2026-08-15 05:00
**버전:** v0.9.1 (task 2.5)
**범위:** options.html, options.css, options.js, tests/unit/options-profile-ui.test.js

## 개요

작업 2.1의 canonical feature profile 스키마와 작업 2.4의 popup preset UI를 기반으로 options 페이지에 고급 기능 스위치를 구현했다. 각 저장된 도메인 행에 프리셋 선택, "고급 설정 펼치기" 토글, 9개 기능별 checkbox, "프리셋으로 되돌리기" 액션을 추가했다. 개별 기능 변경 시 `preset:'custom'`과 전체 9개 feature boolean snapshot이 저장되며, 되돌리기 액션은 선택한 canonical preset snapshot으로 교체한다.

## 변경 파일

### options.html
- `siteRowTemplate`에 프리셋 `<select>` 드롭다운 추가 (6개 preset: 안전/선택/완전/업로드 보호/미디어 보호/사용자 정의)
- "고급 설정 펼치기" `aria-expanded` 토글 버튼과 숨겨진 고급 패널 추가
- 고급 패널에 9개 feature checkbox fieldset 추가 (각 `data-feature` 속성으로 canonical key 매핑)
- "프리셋으로 되돌리기" 영역: 되돌릴 preset `<select>`와 실행 버튼 추가
- 행별 live status 단락 (`role="status"`, `aria-live="polite"`) 추가

### options.css
- `.site-row-preset`, `.preset-select-label`, `.site-preset-select` 스타일 추가
- `.advanced-toggle-button` (aria-expanded 기반 화살표 표시), `.site-row-advanced-panel` 스타일 추가
- `.feature-fieldset`, `.feature-checkbox-label`, `.feature-checkbox` (rosso-corsa accent-color) 스타일 추가
- `.preset-reset-row`, `.preset-reset-button` 스타일 추가
- `.site-row-status` (is-error/is-success/is-warn 상태 클래스) 스타일 추가
- light scheme, max-width:460px 반응형, prefers-reduced-motion 블록 추가
- 버전별 섹션 구분자 주석 유지

### options.js
- 순수 헬퍼 7개 추가 (DOM/chrome.* 의존 없음, VM 테스트 가능):
  - `isAllowedFeatureKey(key, SHARED)`: 9개 canonical feature key allowlist 검증
  - `computeOptionsPresetEntry(currentDomainEntry, presetId, SHARED)`: preset 선택 시 write할 domain entry 계산. `parseDomainSetting(raw)`을 통과시켜 full canonical snapshot 반환
  - `computeFeatureToggleEntry(currentDomainEntry, featureKey, featureValue, SHARED)`: 개별 feature 토글 시 `preset:'custom'`과 전체 9개 feature boolean snapshot 반환. allowlist 외 key는 무시
  - `computePresetResetEntry(currentDomainEntry, presetId, SHARED)`: "프리셋으로 되돌리기" 시 canonical preset snapshot으로 교체
  - `computeProfilePreservingEntry(currentDomainEntry, overrides, SHARED)`: toggle/mode 변경 시 기존 preset/features 보존
  - `featureLabelKorean(key)`: 9개 feature key → 한국어 레이블
  - `optionsPresetLabelKorean(presetId)`: 6개 preset id → 한국어 레이블
- `showRowStatus(el, message, kind)`: 행별 live status 피드백 (success/error/warn)
- `writeDomainSettings(patch)`: promise-tail queue로 call order 보장. 각 write 전 최신 settings re-read
- `updateDomainEntry(hostname, computeEntry)`: `writeDomainSettings` 래퍼
- `writeGlobalEnabled(nextEnabled)`: global toggle용 별도 promise-tail queue
- `removeDomain(hostname)`: `writeDomainSettingsTail`에 chain하여 re-read + delete
- `createSiteRow`: preset select, advanced toggle, feature checkboxes, preset reset 컨트롤 렌더링 및 이벤트 연결
- toggle/mode 핸들러: `computeProfilePreservingEntry()` 사용하여 preset/features 보존 (popup task 2.4 패턴 동일 적용)
- `module.exports`에 순수 헬퍼 7개 추가

### tests/unit/options-profile-ui.test.js (신규)
- 40개 테스트:
  - `isAllowedFeatureKey`: 9개 canonical key 승인, unknown/__proto__/constructor 거부
  - `computeOptionsPresetEntry`: null entry full canonical snapshot (complete/safe/selection/media-safe), existing entry enabled/mode 보존, 9개 feature boolean
  - `computeFeatureToggleEntry`: 토글 시 custom 전환 + 다른 feature 보존, safe preset에서 시작, custom에서 보존, null entry, 9개 feature boolean, allowlist 외 key 무시
  - `computePresetResetEntry`: custom→complete/safe 교체, enabled/mode 보존, null entry
  - `computeProfilePreservingEntry`: toggle/mode 보존, null→default complete, parent custom 보존
  - `featureLabelKorean`/`optionsPresetLabelKorean`: 9개 feature key, 6개 preset 레이블
  - real product queue: rapid preset 직렬화, deferred async write order, interleaved hostname sibling 보존, same-domain last-write-wins, quota fallback
  - `parseDomainSetting` round-trip: 5개 preset, custom, reset, profile-preserving
  - preset→custom transition, full nine-key snapshot, allowlist rejection
  - delete: `removeDomain` 함수 추출 후 VM에서 실행, entry 완전 삭제 검증

## 핵심 설계 결정

1. **6개 preset 전체 노출**: popup은 공간 제약으로 3개 primary preset만 표시하고, options에서 6개 전체 preset과 개별 기능 스위치를 제공한다. `<select>` 드롭다운으로 공간 효율성 확보.

2. **개별 기능 변경 → custom 전환**: `computeFeatureToggleEntry()`가 항상 `preset:'custom'`을 저장한다. 사용자가 개별 기능을 끄면 다른 preset의 기본값이 아닌 사용자가 설정한 값이 `parseDomainSetting()`을 통해 보존된다.

3. **되돌리기는 custom 제외**: "프리셋으로 되돌리기" `<select>`에서 custom을 제외한 5개 preset만 선택 가능하다. custom 자체가 사용자 정의 상태이므로 되돌릴 대상이 아니다.

4. **toggle/mode profile 보존**: popup task 2.4에서 발견한 "profile silent reset" 결함을 options에서도 동일하게 방지한다. `computeProfilePreservingEntry()`가 기존 preset/features를 보존하고 enabled/mode만 override한다.

5. **promise-tail queue**: `writeDomainSettings`는 `let writeDomainSettingsTail = Promise.resolve()`에 `.then()` chain하여 call order를 보장한다. global toggle은 별도 queue(`writeGlobalTail`)로 분리하여 domain write와 독립적으로 동작한다.

6. **whole-object domainSettings semantics**: `writeDomainSettings`가 매 write 전 최신 settings를 re-read하여 sibling domain을 보존한다. `removeDomain`도 re-read + delete 방식으로 whole-object semantics를 유지한다.

7. **sync quota fallback status**: `state.lastWriteFallback` 플래그로 fallback 여부를 추적하며, probe write를 수행하지 않고 `safeSyncSet()`의 실제 write 결과로 판단한다.

## 검증

### 자동 검증 (통과)
- `node --test tests/unit/options-profile-ui.test.js`: 40개 테스트 통과
- `node --test tests/unit/*.test.js`: 전체 238개 테스트 통과 (기존 198 + 신규 40)
- `node --check options.js shared.js keyboard-utils.js tests/unit/options-profile-ui.test.js`: 구문 검사 통과
- `scripts/verify.ps1`: 7개 검사 통과 (JavaScript syntax, manifest parse, MAIN-first content scripts, blocked-event allowlist, required assets, offscreen scripts, git diff --check)
- `git diff --check`: whitespace 오류 없음 (LF→CRLF 경고는 사전 존재 worktree 상태이며 실패 아님)

### 수동 QA (미실행)
- 승인된 unpacked Chrome DevTools 대상이 없어 실제 options UI 동작(프리셋 선택, feature checkbox 토글, 되돌리기, 고급 패널 펼치기)은 직접 관찰하지 못했다.
- 순수 helper 단위 테스트와 정적 검증만으로 UI 동작 완료를 주장할 수 없으며, 배포 전 수동 QA 게이트로 남는다.

### LSP blast radius (미실행)
- `agent-lsp` client가 미초기화 상태로 blast radius 분석을 실행할 수 없었다. AGENTS.md에 문서화된 제약(LSP server가 이 repo에 root되지 않음)이며, built-in diagnostics와 정적 분석으로 대체했다.

## 제약 사항

- `content-main.js` semantics, MAIN allowlist, manifest permissions, profile schema는 수정하지 않았다.
- Lite/Ultimate selector, global toggle, delete 동작, storage fallback semantics는 그대로 유지했다.
- v0.10 work, packaging, commit은 이 작업 범위 밖이다.
- 의존성, 원격 코드, telemetry, network call, permission 추가 없음.

## 검증 실패 수정 (2026-08-15 06:30 retry)

Atlas의 line-by-line review에서 8개 결함이 발견되어 수정했다.

### 수정된 결함

1. **Stale state read**: `updateDomainEntry()`가 queue 진입 전에 `state.domainSettings[hostname]`을 읽어 stale state로 compute했다. `writeDomainSettings(operation)` API를 operation-based로 변경하여, operation 콜백이 critical section 내부에서 fresh `freshDomainSettings[hostname]`을 받도록 수정.

2. **Poisoned promise tail**: `writeDomainSettingsTail.then(...)`에서 하나의 reject가 tail을 영구히 poisoned 상태로 만들었다. `result.catch(() => {})`로 tail recovery를 분리하고, 개별 operation rejection은 caller에게만 전달.

3. **Cross-document safety 부재**: options tab과 side panel이 별도 JavaScript realm에서 독립 promise tail을 가졌다. `withDomainSettingsLock()`이 `navigator.locks.request(DOMAIN_SETTINGS_LOCK_NAME, ...)`로 extension-wide cross-document critical section을 제공. Web Locks 미지원 환경에서는 operation 직접 호출 fallback.

4. **Handler rejection 미처리**: toggle/mode/remove listener에 `.catch()`가 없어 unhandled rejection 발생. 모든 handler에 `.catch(() => showRowStatus(hostname, statusElement, '... 실패', 'error'))` 추가.

5. **Detached status node**: `storage.onChanged` reload가 row를 재생성하면 기존 statusElement가 detached. `state.rowStatus[hostname]` durable map에 status 저장, `restoreRowStatus()`가 재생성된 row에서 복원.

6. **Custom fake reset**: main preset `<select>`에서 custom 선택 시 canonical custom snapshot으로 features 덮어쓰기 위험. `<option value="custom" disabled>`로 설정.

7. **aria-controls 부재**: advanced toggle과 panel이 programmatic relationship 없음. `panelId` 생성 + `aria-controls` + button text toggle('펼치기'/'접기') 추가.

8. **writeGlobalEnabled tail poisoning**: 동일한 recovery 패턴 적용.

### 검증 (retry)

- `node --test tests/unit/options-profile-ui.test.js`: 51개 테스트 통과 (38 pure helper + 13 operation queue/cross-context/status)
- `node --test tests/unit/*.test.js`: 전체 249개 테스트 통과 (198 baseline + 51 new)
- `node --check` 통과, `scripts/verify.ps1` 7개 검사 통과, `git diff --check` exit 0

### 신규 테스트

- rapid sequential feature toggles preserve every preceding toggle (stale state read 결함 검증)
- failure-then-success — second write executes after first rejects (poisoned queue 결함 검증)
- interleaved hostname writes do not lose siblings (sibling 보존)
- same-domain concurrent edits follow last-write-wins (deterministic policy)
- quota fallback sets lastWriteFallback flag
- Web Locks are requested when navigator.locks is available
- removeDomain deletes complete domain entry via actual product path
- removeDomain failure does not poison queue — subsequent write succeeds
- writeGlobalEnabled persists and survives tail recovery
- two-context lock harness: concurrent options-tab and side-panel different-domain writes preserve both siblings
- two-context lock harness: same-domain concurrent options/side-panel changes have deterministic ordering
- showRowStatus: stores status in durable state.rowStatus map by hostname
- showRowStatus: null hostname does not store status
- handler error propagation: toggle/mode/remove listeners attach .catch()
- aria-controls: advanced toggle has programmatic relationship with panel via unique id
- custom option is disabled in main preset select
- preset reset select excludes custom option entirely

## 두 번째 검증 실패 수정 (2026-08-15 08:00 second retry)

Atlas의 두 번째 review에서 4개 결함이 추가로 발견되어 수정했다.

### 수정된 결함 (second retry)

9. **Lock request rejection 영구 pending**: `withDomainSettingsLock()`이 `new Promise()` wrapper로 `navigator.locks.request()` 반환 promise를 무시하여, lock request reject 시 outer Promise가 영구히 pending. 수정: `return navigator.locks.request(name, async () => operation())`로 직접 chain.

10. **Stale syncAvailable가 fallback 숨김**: `renderSyncUsage()`가 `syncAvailable`을 먼저 검사하여 fallback write가 sync bytes 있을 때 숨겨짐. 수정: `lastWriteFallback` 최우선 검사.

11. **Stale entry.enabled로 toggle status**: toggle handler가 row 생성 시 `entry.enabled`를 사용하여 rapid toggle 시 잘못된 텍스트. 수정: `writeDomainSettings`가 `{ fallback, nextDomainSettings }` 반환, handler가 fresh persisted entry에서 enabled 읽기.

12. **Write 후 sync status 미갱신**: write 함수들이 `renderSyncUsage()`를 호출하지 않아 fallback status가 onChanged reload 전까지 미반영. 수정: write 성공 후 즉시 `renderSyncUsage()` 호출.

### 신규 테스트 (second retry)

- lock-request rejection: withDomainSettingsLock rejects when navigator.locks.request rejects without invoking callback
- lock-request rejection: queue recovers after lock rejection — subsequent write succeeds
- visible fallback status: writeDomainSettings calls renderSyncUsage after fallback write
- visible fallback status: fallback takes priority over syncAvailable when sync has bytes
- visible fallback status: writeGlobalEnabled calls renderSyncUsage and surfaces fallback
- rapid repeated toggles: final persisted enabled matches last toggle, not stale render-time entry
- handler error propagation: toggle handler reports persisted enabled from operation outcome, not stale entry (executable, replaces regex proof)
- handler error propagation: toggle failure produces error status via .catch() (executable, replaces regex proof)

### 검증 (second retry)

- `node --test tests/unit/options-profile-ui.test.js`: 58개 테스트 통과
- `node --test tests/unit/*.test.js`: 전체 256개 테스트 통과 (198 baseline + 58 new)
- `node --check` 통과, `scripts/verify.ps1` 7개 검사 통과, `git diff --check` exit 0