# 세션 작업 — v0.6.2 리뷰 후속 개선

**시작:** 2026-08-11 08:54
**근거:** `docs/reviews/2026-08-10_full-code-review.md` (v0.6.1 코드 리뷰)
**대상 릴리스:** v0.6.2 (manifest 버전 상승은 배포 시점에 결정)
**백업 디렉터리:** `history/file-backups/*_20260811_085416_win32_U-N-00658`

## 1. 작업 요약

리뷰에서 발견된 항목 중 우선순위가 높은 7건(H1, M1, M2, M3, L4, L5, L6)을 한 라운드에서 모두 수정했다. M4(탐지 가능성)와 L7(Firefox manifest 호환성)은 문서 작업이거나 별도 검증 라운드가 필요해 보류.

## 2. 변경 매트릭스

| # | 우선순위 | 파일 | 변경 | 의도 |
|---|---------|------|------|------|
| 1 | H1 | `content.js` | `<script type="application/json" id="__rightClickOnWebStats">` 채널 추가, `syncStatsToDom()` / `ensureStatsDomElement()` 헬퍼 도입, `resetStats`·`resolveAndApply`에 마운트 | QA 통계 패널 복구. DOM은 cross-world 공유 → 페이지 컨텍스트에서 JSON.parse 가능 |
| 2 | H1 | `tests/manual/blocked-page.html` | `showStats` 핸들러를 DOM 채널로 변경 | 위 H1에 맞춰 페이지 측 reader 갱신 |
| 3 | M1 | `content-main.js` | `BLOCKED_EVENT_NAMES`에서 `copy`/`cut`/`paste` 제거 | MAIN 패치는 등록 시점에 타겟을 알 수 없어 편집 요소 면제 불가 → 웹 에디터의 정상 paste 핸들러 손상. 차단 전용 페이지는 ISOLATED `stopImmediatePropagation`으로 그대로 차단되므로 손실 없음 |
| 4 | M2 | `content.js` | `rescanIntervalMs` 2000 → 5000 | MutationObserver가 1차 방어 → 주기 재스캔은 detached-subtree 안전망으로만 동작해도 충분. 대형 페이지 메인 스레드 부담 경감 |
| 5 | M3 | `popup.js` | `state.matchedKey` 추가, `render()`에서 부모 도메인 매칭 시 "상위 도메인(X) 설정 ON/OFF 상속 중" 힌트 + per-hostname shadow entry 생성 경고 | 사용자 인지 부족 해소. 토글/모드 선택은 정확 hostname에 쓰기(부모 변경은 형제 서브도메인 전파 위험 → 의도치 않은 영향 방지) |
| 6 | L4 | `background.js` | 메뉴 제목의 하드코딩 `(v0.6.0)` 제거 | 매 릴리스 수동 갱신 부담·사용자 노이즈 제거 |
| 7 | L5 | `popup.js` | `handleSessionToggle` try/catch, 실패 시 `sessionNotice`로 가시화 | storage.session 실패 시 unhandled rejection 방지 |
| 8 | L6 | `options.js` | `removeDomain` 진입 시 `window.confirm()` | 실수 클릭으로 도메인 설정 즉시 삭제되는 문제 방지 |
| 9 | — | `AGENTS.md` | `BLOCKED_EVENT_NAMES` 행을 v0.6.2 변경 반영 | 문서 일관성 |

## 3. 설계 결정

### H1 — cross-world 채널로 DOM 선택

채널 후보와 비교:

| 후보 | 장점 | 단점 |
|------|------|------|
| `window.postMessage` | 양방향, 표준 | 콜백 함수가 world 경계를 넘지 못함. 페이지 → 콘텐츠 단방향 요청에 적합, 콘텐츠 → 페이지 전송은 동일 |
| CustomEvent + DOM 이벤트 | 동일 worlds에서 자유 | `event.detail`의 함수 참조가 world를 못 넘음. 동일 한계 |
| DOM `<script type="application/json">` textContent | DOM은 양 world 공유. 단방향·단순·무실행·무렌더링 | 양방향 불가. 페이지 측 poll 필요 |

QA는 단방향 조회만 필요(콘텐츠 → 페이지). DOM `<script type="application/json">`이 가장 단순하고 부수 효과 0이라 선택했다. 초기 구현 검증에서 카운터 변화가 DOM 스냅샷에 반영되지 않는 결함을 발견해, `scheduleStatsSync()`가 같은 작업 단위의 여러 변화를 `queueMicrotask`로 합친 뒤 최신 JSON을 기록하도록 보완했다.

### M3 — 부모 매칭을 정확 hostname shadow로 처리

기존 쓰기 경로는 정확 hostname에 entry를 만든다(`writeDomainSettings({[state.hostname]: ...})`). M3에서도 그 동작을 유지했다. 부모 도메인 entry를 직접 뒤집으면 형제 서브도메인에 영향이 가서 의도하지 않은 결과를 만들 수 있어 사용자에게 per-host 예외로 만드는 것이 안전. 힌트로 안내해 의도를 인지시키되, 실제 데이터 변경은 보수적으로 유지.

## 4. 검증 체크리스트 (수동)

사용자가 `chrome://extensions`에서 unpacked로 로드 후 다음을 확인 권고:

- [ ] **시나리오 1/6:** 우클릭·복사·드래그 차단 해제, 사후 등록 리스너 무력화
- [ ] **시나리오 7:** "실행 통계 보기" 버튼 → 카운터 패널에 `attributeRemovals`, `eventInterceptions`, `periodicRescans`이 증가한 값으로 표시됨
- [ ] **시나리오 8:** Closed Shadow DOM 변환 후 내부 차단 해제
- [ ] **시나리오 9:** 도메인 OFF 적용 시 통계의 `resolveSource: "domain"`, `matchedDomain: <hostname>` 표시
- [ ] **시나리오 10:** 세션 모드 우선 적용
- [ ] **시나리오 11:** Lite/Ultimate 모드 동작
- [ ] **신규 — 부모 상속:** 옵션 페이지에서 `example.com` OFF 설정 → 팝업에서 `www.example.com` 방문 → 힌트가 "상위 도메인(example.com) 설정 OFF 상속 중 — 토글/모드 선택 시 www.example.com 전용 설정이 생성됩니다"
- [ ] **신규 — 웹 에디터:** Google Docs / Notion 등의 contenteditable에서 우클릭 → 컨텍스트 메뉴 정상, 붙여넣기 정상
- [ ] **L4:** 확장 아이콘 우클릭 → "사이트 패널에서 열기" (버전 표기 없음)
- [ ] **L6:** 옵션 페이지 → 임의 도메인 "설정 삭제" → 확인 다이얼로그

## 5. 보류 항목

- M4(탐지 가능성): README/스토어 설명 보강으로 별도 진행
- L1(content.js 초기 stats 미할당): 무해, 그대로 둠
- L2/L3(background.js 콜백 lastError/경합): 실무 영향 미미, 그대로 둠
- L7(Firefox manifest 호환성 재확인): 별도 검증 라운드

## 6. 후속 권고

- 매니페스트 `version` 필드 상승(0.6.1 → 0.6.2)은 스토어 재제출 직전에 결정
- 변경 사항은 기능/QA 회귀를 묶어 단일 커밋으로 정리 권고
- H1로 도입한 DOM 채널은 향후 디버깅 surface(postMessage 브리지, page-side panel 등)의 토대가 될 수 있어 이름(`__rightClickOnWebStats`)을 미래 변경 시에도 유지할 것

## 7. 완료 검증 보완 (2026-08-11)

- 초기 DOM 브리지는 카운터가 변한 뒤 스냅샷을 갱신하지 않는 결함이 있었다. `scheduleStatsSync()`로 속성 제거·이벤트 차단·오버레이·Shadow DOM·주기 재스캔의 변경을 microtask 단위로 합쳐 최신 JSON을 기록하도록 보완했다.
- 하니스는 JSON 존재만 신뢰하지 않고 확장 마커(`data-right-click-on-web="true"`)와 필수 통계 구조를 검증한다. 따라서 페이지가 만든 임의 JSON을 실행 통계로 표시하지 않는다.
- 실제 Chrome 탭에서 하니스 페이지와 통계 버튼의 유효 JSON 표시·거부 경로를 확인했다. 다만 이 환경의 Google Chrome 151은 `--disable-extensions-except`를 허용하지 않으며 프로젝트의 `--load-extension`도 등록하지 않아, 자동 unpacked 확장 주입은 검증할 수 없었다. 이는 코드 실행 실패가 아니라 브라우저 명령줄 정책 제한이다.
