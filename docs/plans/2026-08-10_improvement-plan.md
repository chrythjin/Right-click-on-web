# 개선 계획 — 코드 리뷰 후속 (v0.6.2)

**일자:** 2026-08-10
**기준:** `docs/reviews/2026-08-10_full-code-review.md`
**대상 버전:** v0.6.1 → v0.6.2 (manifest 버전 상승은 배포 시점에 결정)

## 1. 목표

리뷰에서 발견된 **HIGH 1건 / MEDIUM 3건 / LOW 3건**을 우선순위에 따라 수정한다. 외부 호환성·배포 절차는 변경하지 않으며, 코드·QA 하니스·문서만 갱신한다.

## 2. 변경 항목

### H1. QA 통계 패널을 cross-world 채널로 복구
- **원인:** `window.__rightClickOnWebStats`는 ISOLATED world 전용 → 페이지 스크립트에서 읽을 수 없음.
- **수정:**
  - `content.js`: documentElement 아래 `<script type="application/json" id="__rightClickOnWebStats">` 요소를 만들고, `queueMicrotask`로 같은 작업 단위의 갱신을 합치는 헬퍼(`scheduleStatsSync`)가 stats 객체를 JSON.stringify해 textContent로 기록. 갱신 트리거: `resetStats`, `resolveAndApply`, 속성·이벤트·오버레이·Shadow DOM·주기 재스캔 카운터 변경.
  - `tests/manual/blocked-page.html`: showStats 핸들러를 DOM 요소의 textContent → JSON.parse로 변경. 파싱 실패 시 폴백 메시지.
- **영향:** ISOLATED ↔ MAIN world 간 안전한 단방향 채널 확보. 다른 world 시나리오에서 재사용 가능.

### M1. MAIN world에서 `copy`/`cut`/`paste` 제거
- **원인:** MAIN 패치는 등록 시점에 타겟을 알 수 없어 편집 요소 면제 불가 → Google Docs·Notion 등 웹 에디터의 정상 paste 핸들러가 sentinel로 대체됨.
- **수정:** `content-main.js`의 `BLOCKED_EVENT_NAMES`에서 `copy`, `cut`, `paste` 제거. `contextmenu`, `selectstart`, `dragstart`만 남김(주 사용처 = 차단).
  - 차단 전용 페이지는 ISOLATED capture 인터셉터(`stopImmediatePropagation`)가 그대로 cover.
  - 편집 요소는 ISOLATED 인터셉터가 `isEditableElement`로 면제 → MAIN 제거 후에도 페이지 측 paste/copy 핸들러가 정상 동작.
- **영향:** 웹 에디터 호환성 회복. 차단은 유지.

### M2. 주기 재스캔 간격 완화
- **원인:** 2초마다 전체 DOM TreeWalker + 8개 속성 `querySelectorAll`이 반복.
- **수정:** `RIGHT_CLICK_ON_WEB.rescanIntervalMs` 2000 → 5000. MutationObserver가 1차 방어, 주기 재스캔은 최후 수단이라는 설계 의도에 맞춰 간격을 늘림.
- **영향:** MutationObserver 반응성은 동일(0~수십 ms), 정기 재스캔 비용 60% 감소.

### M3. 부모 도메인 매칭 시 팝업 힌트 보강
- **원인:** `state.domainEntry`가 정확 일치 hostname만 확인 → 부모 도메인 엔트리가 적용 중일 때 "기본값 따름"으로 잘못 표시.
- **수정:** `popup.js` 렌더 단계에서 `SHARED.resolveDomainKey(hostname, domainSettings)`를 호출해, 매칭 키가 hostname과 다르면 힌트에 "상위 도메인(example.com) 설정을 상속 중" 표시. 도메인 토글/모드 선택은 정확 hostname에 shadow entry를 생성해 per-site 예외를 두는 기존 동작 유지(부모 변경은 형제 서브도메인에 영향 → 의도치 않은 전파 방지).
- **영향:** 사용자가 부모 매칭 상태를 인지. 안전성(per-site 예외 우선) 유지.

### L4. 컨텍스트 메뉴의 하드코딩 버전 문자열 제거
- **수정:** `background.js`의 `'사이트 패널에서 열기 (v0.6.0)'` → `'사이트 패널에서 열기'`. 매 릴리스 수동 갱신 부담·사용자 노이즈 제거.

### L5. 세션 토글 에러 처리
- **수정:** `popup.js`의 `handleSessionToggle`을 try/catch로 감싸고 실패 시 사용자 알림(요소는 sessionNotice 재사용). UI 상태는 그대로 두고 텍스트만 표시.

### L6. 옵션 페이지 도메인 삭제 확인
- **수정:** `options.js`의 `removeDomain` 진입 시 `confirm()`으로 hostname을 명시한 메시지 표시. 취소 시 early return.

## 3. 변경하지 않는 항목 (의도적 보류)

- **M2深层(TreeWalker 비효율):** M2의 간격 완화로 체감 비용은 충분. 추가 최적화(범위 축소, Shadow host 캐시)는 다음 릴리스에서 프로파일링 후 결정.
- **M4(탐지 가능성):** 라이브러리 한계. README/스토어 설명 보강은 별도 문서 작업으로 분리.
- **Firefox manifest 호환성(L7):** MAIN world·match_origin_as_fallback는 FF128+에서 지원. 별도 검증 라운드 필요.

## 4. 작업 순서

1. (완료) 계획서 작성 및 저장.
2. 백업 + H1: content.js 통계 DOM 노출 + throttle 헬퍼.
3. 백업 + H1: blocked-page.html showStats 핸들러 변경.
4. 백업 + M1: content-main.js BLOCKED_EVENT_NAMES 축소 + 주석 갱신.
5. 백업 + M2: content.js rescanIntervalMs 변경.
6. 백업 + M3: popup.js 부모 도메인 상속 힌트.
7. 백업 + L4: background.js 메뉴 제목 정리.
8. 백업 + L5: popup.js 세션 토글 try/catch.
9. 백업 + L6: options.js 삭제 confirm.
10. history_summary 및 세션 문서 작성.
11. (선택) `ocr review`로 변경 검증.

## 5. 회귀 검증 체크리스트

- [ ] 시나리오 1: 우클릭/선택/복사/드래그 차단 해제
- [ ] 시나리오 6: 사후 등록 리스너 무력화
- [x] 시나리오 7의 DOM JSON 파싱 UI: 브라우저에서 유효 JSON을 통계 패널에 표시하고, 마커·필수 스키마가 없는 값은 거부하는지 확인
- [ ] 시나리오 7: unpacked 확장으로 `periodicRescans` 카운터 증가 확인 (DOM 경유, 자동화 환경의 Google Chrome 명령줄 정책으로 미실행)
- [ ] 시나리오 8: Closed Shadow DOM 변환 + 내부 차단 해제
- [ ] 시나리오 9: 도메인 OFF 적용 시 `resolveSource=domain` / `matchedDomain` 표시
- [ ] 시나리오 10: 세션 모드 우선
- [ ] 시나리오 11: Lite/Ultimate 모드 동작
- [ ] **신규:** 부모 도메인(`example.com`)에 ON/OFF 설정 후 `www.example.com`에서 "상위 도메인 상속" 힌트 표시
- [ ] **신규:** Google Docs/Notion 등 contenteditable에서 paste/copy 정상 (웹 에디터 회귀)

## 6. 검증 환경 제한 (2026-08-11)

- 로컬 하니스는 `127.0.0.1` 정적 서버에서 실제 Chrome 탭으로 열어 제목·버튼·통계 패널의 유효 JSON 표시와 거부 경로를 확인했다.
- 이 환경의 Google Chrome 151은 `--disable-extensions-except`를 허용하지 않는다고 명시적으로 기록했고, `--load-extension`으로 프로젝트 확장을 등록하지 않았다. 따라서 자동화된 unpacked 확장 주입, DOM 브리지 생성, 카운터 증가 확인은 이 라운드에서 성립하지 않는다.
- 실제 확장 런타임 시나리오는 Chrome의 `chrome://extensions`에서 이 저장소를 unpacked로 수동 로드한 뒤 위 체크리스트를 실행해 완료 처리한다.
