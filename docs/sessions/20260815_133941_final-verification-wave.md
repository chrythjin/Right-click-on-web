# v0.9.0부터 v0.10.0 최종 검증 파동

## 목적

`.omo/plans/v0-9-v0-10-benchmark-roadmap.md`의 마지막 게이트를 닫기 위해, `ocr review` 결함 수정 라운드 이후의 F1 자동 게이트, F2 코드 검토, F3 문서 정합성, F4 수용 기준 검토를 한 번에 기록한다. 수정 라운드의 대상은 `ocr-image-utils.js`, `popup.js`, `popup.html`, `scripts/verify.ps1`이다.

## F1 자동 게이트: APPROVE

* `node --test tests/unit/*.test.js`는 312개 전부 통과했다.
* 제품 JavaScript 12개에 대한 `node --check`가 모두 통과했다.
* `pwsh -NoProfile -File scripts/verify.ps1`가 PASS했고, `git diff --check`도 깨끗했다.
* `right-click-on-web-v0.10.0.zip`의 29개 항목은 현재 소스와 SHA-256 byte-level 대조에서 모두 일치했다.

## F2 코드 검토: 수정 후 APPROVE

초기 `ocr review`는 `scripts/verify.ps1`의 이중 background 선언 검증 결함으로 REJECT였다. `service_worker`가 있으면 조기 반환해 `scripts` 배열의 `image-context.js`, `ocr-history.js`, `background.js` 순서를 확인하지 않았고, StrictMode에서 속성 접근 위험도 있었다.

수정본은 `PSObject.Properties` 존재 검사로 속성 유무를 안전하게 판별하고, 두 background 선언을 조기 반환 없이 독립 검증한다. fixture proof는 dual 선언 PASS, 순서를 바꾼 `scripts` FAIL, service-worker-only PASS, scripts-only PASS로 확인됐다. 재검토 결과는 APPROVE다.

## F3 문서 정합성: APPROVE

* 버전 표기는 모두 `0.10.0`으로 정렬했다.
* 이전 세션 문서 4개와 `docs/INDEX.md` 등록을 대조했다.
* 개인정보 문구는 개발자나 제3자의 외부 수집이 없다는 범위를 유지하면서, 기기 내 OCR과 사용자가 선택한 로컬 기록은 보존했다.
* 패키지 목록에는 `ocr-image-utils.js`가 포함됐고, 계획 체크박스 분류도 현재 상태와 일치한다.

## F4 수용 기준: APPROVE

17개 수용 항목을 작업 묶음 1부터 8까지로 판정했다.

| 작업 묶음 | 판정 | 근거 |
| --- | --- | --- |
| 1 | BLOCKED-BY-EXTERNAL-GATE | 실제 unpacked Chrome 관찰 대상 부재 |
| 2 | BLOCKED-BY-EXTERNAL-GATE | 실제 unpacked Chrome 관찰 대상 부재 |
| 3 | SATISFIED | 자동 검증과 구현 근거 충족 |
| 4 | SATISFIED | 자동 검증과 구현 근거 충족 |
| 5 | BLOCKED-BY-EXTERNAL-GATE | 실제 unpacked Chrome 관찰 대상 부재 |
| 6 | BLOCKED-BY-EXTERNAL-GATE | 실제 unpacked Chrome 관찰 대상 부재 |
| 7 | SATISFIED | 자동 검증과 문서 정합성 충족 |
| 8 | SATISFIED | 최종 패키지와 정적 게이트 충족 |

`- [~]` 상태인 작업 5개는 모두 외부 게이트에 정확히 귀속됐다. 구현 또는 자동 검증 실패로 분류한 항목은 없다.

## 16개 체크리스트 종료

16개 종료 체크리스트 가운데 12개는 `- [x]`로 닫았다. 각 항목의 자동 검증, 코드 검토, 문서 또는 패키지 근거를 기록했다. 수동 QA harness 항목 하나는 작업 1.6, 1.8, 2.3, 2.7, 3.6과 같은 외부 Chrome 관찰 게이트 때문에 `- [~]`로 유지했다.

## 최종 계획 상태

계획 체크박스는 `- [x]` 31개, `- [~]` 6개, `- [ ]` 0개다. 남은 외부 차단 항목은 작업 1.6, 1.8, 2.3, 2.7, 3.6이며, 모두 실제 unpacked Chrome 관찰 대기를 뜻한다.

최소 해제 조건은 이 저장소를 unpacked로 로드한 Chrome을 Playwright/CDP 또는 chrome-devtools MCP 대상에 연결하는 것이다. 그 대상에서 수동 관찰을 마치면 외부 게이트 항목만 별도 증거로 닫을 수 있다.
