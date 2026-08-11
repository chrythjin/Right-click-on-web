# Right-click on Web — 전체 코드 리뷰 보고서

**일자:** 2026-08-10
**대상 버전:** v0.6.1 (manifest.json)
**범위:** 런타임 전체 — `manifest.json`, `shared.js`, `content.js`, `content-main.js`, `background.js`, `popup.html/js/css`, `options.html/js/css`, `tests/manual/blocked-page.html`, `popup-preview.html`
**방식:** 수동 정밀 리딩 (LSP/codegraph 미사용 — 프로젝트 제약)

---

## 1. 총평

전체적으로 **품질이 높은 코드베이스**입니다. 세 실행 컨텍스트(팝업/콘텐츠 스크립트/백그라운드)가 `shared.js` 단일 모듈을 공유해 결정 로직의 드리프트를 원천 차단했고, 스토리지 계층(session > domain > global)의 우선순위, 쿼터 폴백 마커, 마이그레이션 멱등성, race-condition 가드(`resolvePromise`/`writeDomainSettingsPromise`/`writePromise`/`loadStatePromise`) 등 동시성·내결함성 설계가 실무 수준으로 탄탄합니다. 동적 데이터는 전부 `textContent`로 렌더링해 XSS 경로가 없고, 원격 코드 로딩·네트워크 호출이 없어 Chrome Web Store 정책에도 부합합니다.

다만 **QA 통계 패널이 구조적으로 동작하지 않는 결함(High 1건)**과, 웹 에디터 호환성·성능·팝업 표시 정확성에 관한 Medium 4건을 발견했습니다.

---

## 2. 심각도별 발견 사항

### [HIGH] H1. 수동 QA 통계 패널이 실제로는 절대 표시되지 않음

- **위치:** `content.js:90` (`resetStats` → `window.__rightClickOnWebStats = stats`), `tests/manual/blocked-page.html:396`
- **내용:** 콘텐츠 스크립트는 Chrome의 **ISOLATED world**에서 실행되며, 이곳에서 `window`에 설정한 expando는 페이지(MAIN world) 스크립트에 **보이지 않습니다**. 테스트 페이지의 `showStats` 핸들러는 페이지 컨텍스트에서 `window.__rightClickOnWebStats`를 읽으므로 항상 `undefined` → "통계 데이터 없음"만 표시됩니다. 시나리오 7(`periodicRescans` 증가 확인)·9(`resolveSource`/`matchedDomain` 확인)·11(`mode` 확인)이 이 패널에 의존하므로, 해당 검증 절차는 현재 수행 불가능합니다. (DevTools 콘솔에서 컨텍스트를 확장의 isolated world로 전환하면 볼 수 있지만, 하니스의 의도와 다릅니다.)
- **권장 수정:** 통계를 DOM 경유로 노출 — 예: `document.documentElement` 아래 숨김 `<div id="__rcow-stats">`의 `textContent`에 JSON을 주기적으로 기록(DOM은 두 world가 공유). 또는 `window.postMessage` 브리지로 페이지가 요청하면 응답.

### [MEDIUM] M1. MAIN world의 `copy`/`paste` 리스너 전역 무력화 — 웹 에디터 호환성 위험

- **위치:** `content-main.js:52-59` (`BLOCKED_EVENT_NAMES`에 `copy`, `cut`, `paste` 포함)
- **내용:** MAIN world 패치는 리스너 **등록 시점**에 타겟을 알 수 없어 편집 요소 면제를 적용할 수 없습니다. 따라서 Google Docs·Notion·웹 기반 에디터처럼 `copy`/`paste` 이벤트 리스너로 커스텀 클립보드 데이터를 제공하는 **정상적인 사이트 기능이 깨집니다**. ISOLATED world 인터셉터는 `isEditableElement` 면제가 있지만 MAIN 패치는 전역입니다. 참고로 `copy`/`paste`의 preventDefault 차단 자체는 ISOLATED capture-phase 인터셉터(`stopImmediatePropagation`)만으로도 커버되므로, MAIN 목록에서의 제거가 기능 손실 없이 호환성을 개선할 가능성이 있습니다.
- **권장:** `copy`/`paste`를 MAIN 목록에서 제외하고 ISOLATED에서만 처리하는 방안을 QA 시나리오와 함께 검토. 최소한 README/스토어 설명에 웹 에디터 영향 가능성을 명시.

### [MEDIUM] M2. 주기 재스캔의 전체 DOM TreeWalker — 대형 페이지 성능 부하

- **위치:** `content.js:432-448` (2초 간격), `content.js:274-296` (`discoverShadowHosts`의 TreeWalker 전체 순회)
- **내용:** `removeBlockingAttributes()`가 호출될 때마다 `discoverShadowHosts`가 `createTreeWalker`로 **문서 전체 엘리먼트를 순회**하고, 8개 차단 속성에 대한 `querySelectorAll`도 전체 DOM 대상입니다. 이것이 2초 간격으로 반복됩니다. `requestIdleCallback` 지연과 탭 숨김 시 일시정지 완화책은 있으나, 수만 개 노드의 대형 SPA에서는 지속적인 메인 스레드 비용이 됩니다.
- **권장:** MutationObserver가 이미 `childList+subtree`를 감시하므로 주기 재스캔은 최후 수단으로 간격을 늘리거나(예: 10초+), Shadow host 발견만 별도 저비용 경로로 분리.

### [MEDIUM] M3. 팝업 도메인 힌트가 부모 도메인 매칭을 반영하지 못함

- **위치:** `popup.js:90-92` (`state.domainEntry`는 정확 일치 hostname만 확인), `popup.js:176-178`
- **내용:** 실제 ON/OFF 결정(`isDomainEnabled`→`resolveDomainKey`)은 부모 도메인까지 워킹해 매칭하지만, `domainEntry`는 `hasOwnProperty(정확한 hostname)`만 봅니다. 결과: `example.com` 엔트리가 있는 상태에서 `www.example.com` 방문 시 토글은 부모 엔트리 기준으로 ON/OFF를 올바르게 표시하지만, 힌트는 "기본값 따름 (전역 ON)"으로 **잘못 안내**합니다. 또한 이 상태에서 토글/모드 변경 시 정확한 hostname에 새 엔트리가 생겨 부모 엔트리를 섀도잉하는데, 사용자는 그 사실을 알 수 없습니다.
- **권장:** `SHARED.resolveDomainKey(state.hostname, state.domainSettings)` 결과가 hostname과 다르면 힌트에 "상위 도메인(example.com) 설정 상속 중"으로 표시.

### [MEDIUM] M4. 프로토타입 패치의 페이지 측 탐지 가능성

- **위치:** `content-main.js:134, 162, 191`
- **내용:** `EventTarget.prototype.addEventListener` 등을 덮어쓰므로 페이지가 `addEventListener.toString()`에 `native code`가 아닌 함수 본문이 찍히는지 확인하거나, 등록한 리스너가 실제로 발화하는지 카나리 이벤트로 검사해 **패치를 감지하고 우회**(예: `onclick` 프로퍼티 대신 포인터 이벤트+커스텀 메뉴로 차단)할 수 있습니다. 우클릭 차단 우회 확장의 숙명적 한계지만, README의 "제한 사항"에 탐지 가능성을 명시하는 것이 정직한 안내입니다.

### [LOW]

| # | 위치 | 내용 |
|---|------|------|
| L1 | `content.js:64, 90` | 최초 `createStats()` 결과는 `window`에 할당되지 않고 `enableUnlocker`의 `resetStats()`에서만 노출. OFF 상태에서는 `resolveSource` 진단도 갱신되지 않음(무해하나 주석과 불일치). |
| L2 | `background.js:50-63` | `initializeStorage()`가 콜백 API를 `lastError` 확인 없이 사용. 실패 시 조용히 무반응. |
| L3 | `background.js:182-204` | `registerContextMenus`를 `onInstalled`/`onStartup`/`storage.onChanged`에서 비동기로 호출 — 동시 호출 시 `removeAll`→`create` 인터리빙 경합 가능(실무 영향 미미). |
| L4 | `background.js:196` | 컨텍스트 메뉴 제목에 버전 문자열 하드코딩(`'사이트 패널에서 열기 (v0.6.0)'`) — 매 릴리스 수동 갱신 필요, 사용자에게 노이즈. |
| L5 | `popup.js:332-342` | `handleSessionToggle`에 에러 처리 없음 — `chrome.storage.session` 쓰기 실패 시 unhandled rejection. |
| L6 | `options.js:154-161` | 도메인 설정 삭제에 확인 절차 없음 — 실수 클릭 시 즉시 삭제(의도된 단순함일 수 있으나 undo도 없음). |
| L7 | `manifest.json:34-35, 36` | `match_origin_as_fallback`/`world:"MAIN"`의 Firefox 128 지원 범위 재확인 권고. Firefox가 특정 키를 무시하면 opaque 프레임 커버리지(#483 대응분)가 Chrome과 달라질 수 있음. |

---

## 3. 파일별 상세 소견

### `manifest.json` (56줄)
- MAIN world 엔트리가 ISOLATED 엔트리보다 먼저 선언(#482 규칙 준수), `document_start` + `all_frames` + `match_about_blank` + `match_origin_as_fallback`로 프레임 커버리지 확보 — 적절.
- `background.scripts`(Firefox)와 `service_worker`(Chrome) 병기는 의도된 이중 선언(#489). Chrome은 미지 키를 경고만 하고 무시.
- `minimum_chrome_version: 121`은 `world:"MAIN"`(111+)과 side panel(114+) 요구치를 충족. Gecko `strict_min_version: 128`은 Firefox MAIN world 지원 기준과 정합.
- 권한 4개(`storage`, `activeTab`, `contextMenus`, `sidePanel`) 모두 사용처가 코드에 존재 — 과잉 권한 없음.

### `shared.js` (496줄)
- `resolveDomainKey`의 깊이 캡(depth ≤ 5, 후보 6회 검사)과 public-suffix 차단 로직 정확. 주석(7레이블까지 매칭)과 구현 일치.
- `parseDomainSetting`/`normalizeDomainSettings`의 방어적 스키마 정규화가 읽기 경로 전체에 일관 적용 — 레거시 boolean 엔트리에 안전.
- `resolveSettings`의 병합 순서(defaults < local < sync, 폴백 마커 최우선)가 메모리 #448/#449와 정확히 일치.
- `safeSyncSet`의 성공 시 마커 정리, 쿼터 실패 시 로컬+마커 기록 경로 모두 정상. 로컬 쓰기마저 실패하면 throw — 호출부가 catch 하므로 OK.

### `content.js` (733줄)
- 이중 실행 세계의 역할 분담이 주석과 구현에서 일치. capture 인터셉터의 편집 요소 면제(`isEditableElement`) 정상.
- `clearLockedIdlAttribute`의 descriptor 재정의 경로가 accessor/value 케이스를 모두 커버 — 세심함.
- `disableUnlocker`가 AbortController·observer·타이머·스타일을 정리하고, OFF 후 재ON 시 `enableUnlocker`가 멱등 복귀 — 정상.
- 이슈: H1(통계 노출), M2(TreeWalker 비용), L1(초기 stats 미노출).

### `content-main.js` (192줄)
- sentinel no-op + `removeEventListener` 매핑(WeakMap 2단)으로 AbortSignal/제거 계약 보존 — 설계 우수.
- `patchedAttachShadow`의 `Object.create(init)` 기반 init 정규화 — 상속/비열거 멤버 보존 정확.
- 이슈: M1(copy/paste 전역 무력화), M4(탐지 가능성).

### `background.js` (257줄)
- `setAccessLevel('TRUSTED_AND_UNTRUSTED_CONTEXTS')`을 install/startup 양쪽에서 호출(#534 대응) — 정상.
- 마이그레이션: local→sync는 update 시에만 + sync 비어있을 때만(덮어쓰기 방지), v0.5.0 스키마 정규화는 변경 감지 후에만 쓰기 — 쿼터 절약 의식이 일관.
- 컨텍스트 메뉴/사이드 패널 모두 API 존재 가드 + options 폴백 — Firefox 안전.
- 이슈: L2, L3, L4.

### `popup.html/js` + `popup.css`
- 요소 존재 fail-fast 검사(`popup.js:52-56`) — HTML/JS 드리프트 조기 발견에 좋은 패턴.
- 렌더링은 전부 `textContent`, 상태는 `chrome.storage.onChanged` 재로딩으로 동기화, `loadStatePromise` 코얼레싱 — 정상.
- 세션 미지원 브라우저 안내(Firefox), 동기화 사용량 표시(80% 경고), side panel 미지원 시 버튼 숨김 — 방어적 UI 완비.
- 이슈: M3(부모 도메인 힌트), L5(세션 토글 에러 미처리).

### `options.html/js` + `options.css`
- `persist()`가 쓰기를 직렬화하고 각 쓰기 전 `resolveSettings`로 재읽기 — 다중 창 경합에 안전.
- 사이트 행 렌더링은 `<template>` + `textContent` — hostname 인젝션 불가.
- 이슈: L6(삭제 확인 없음).

### `tests/manual/blocked-page.html` (408줄)
- 11개 시나리오가 v0.2.0~v0.5.0 기능을 빠짐없이 커버. 인라인 차단·사후 리스너·재바인딩·closed shadow·드롭 영역 등 실전 패턴 충실.
- 이슈: H1 — 통계 패널(시나리오 7/9/11의 검증 수단)이 world 분리로 동작 불가.

### `popup-preview.html` (66줄)
- 확장에 로드되지 않는 독립 ASCII 프리뷰 — 런타임 영향 없음. 현재 팝업 구조(모드 카드, 세션 버튼, 동기화 표시)와 대체로 일치.

---

## 4. 긍정적 관찰 (유지할 것)

1. **공유 모듈 단일화** — 결정 로직의 3-컨텍스트 일관성 확보, 드리프트 원천 차단.
2. **동시성 설계** — resolve/write/load 코얼레싱, read-modify-write 재읽기, 쓰기 직렬화.
3. **마이그레이션 안전성** — 멱등 + 변경 감지 후에만 쓰기 + sync 우선 보호.
4. **보안 위생** — 동적 렌더링 전량 `textContent`, 원격 코드·네트워크·텔레메트리 없음.
5. **플랫폼 방어** — Firefox API 갭(세션 스토리지, 사이드 패널)에 대한 가드와 사용자 안내.
6. **접근성** — `aria-pressed`/`aria-checked`/`aria-live`, focus-visible 스타일, reduced-motion 대응.

## 5. 권장 조치 우선순위

| 순위 | 항목 | 작업 |
|------|------|------|
| 1 | H1 | 통계를 DOM/`postMessage`로 노출해 QA 하니스 복구 |
| 2 | M1 | `copy`/`paste`의 MAIN 목록 제외 여부를 호환성 테스트로 검증 |
| 3 | M3 | 팝업 힌트에 부모 도메인 상속 표시 |
| 4 | M2 | 재스캔 간격 상향 또는 범위 축소 검토 |
| 5 | L4, L5, L6 | 메뉴 버전 문자열 제거, 세션 토글 catch, 삭제 확인 추가 |
