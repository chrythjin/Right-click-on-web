# 순수 함수 테스트 경계 마련

**일시:** 2026-08-13 20:15:29 +09:00  
**범위:** 계획 작업 0.3, Node 내장 `node:test` 기반 설정·OCR 좌표 수학 경계

## 변경 내용

- `shared.js`의 설정 정규화 함수 `parseDomainSetting`과 `normalizeDomainSettings`를 Node에서 직접 import 가능한 순수 seam으로 분리했다.
- Node 분기는 브라우저 초기화 IIFE를 실행하지 않으며, 브라우저 분기는 기존 `RIGHT_CLICK_ON_WEB_SHARED` API를 유지한다.
- `ocr-image-utils.js`에 DPR 반올림과 캡처 경계 clamp를 두고 `offscreen.js`의 실제 `cropImage`가 이를 호출하도록 연결했다.
- `tests/unit/`에 legacy/객체 설정 정규화, 비변이성, DPR 반올림, 음수·초과 좌표 및 0영역 clamp 테스트를 추가했다.
- 외부 라이브러리, npm, 번들러, lockfile, manifest 및 Chrome runtime 흐름은 변경하지 않았다.

## Baseline 및 Failing-first 증거

- 제품 변경 전 VM characterization 실행: 설정 테스트 2개 통과, `pass 2`, `fail 0`, `duration_ms 313.3578`.
- Node direct-import seam을 요구한 최초 실행: `ocr-image-utils.js`의 `MODULE_NOT_FOUND`와 `shared.parseDomainSetting`/`normalizeDomainSettings` export 부재로 `pass 0`, `fail 3`.
- AI 리뷰 후 음수 크기 경계 테스트를 먼저 추가한 실행: 실제값 `sw: -10`, `sh: -16`, 기대값 `0`, `pass 3`, `fail 1`. 이후 제품 helper에서 0으로 clamp했다.

## 검증

최종 명령:

```powershell
node --test .\tests\unit\*.test.js
```

최종 출력 요약:

```text
tests 7
pass 7
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 332.5018
```

- 동일 테스트 반복 실행 3회가 모두 통과했다.
- 변경된 모든 JS 파일에 `node --check`를 실행해 통과했다.
- `scripts/verify.ps1`은 JavaScript syntax, manifest, MAIN-first 순서, 로컬 OCR asset, 로컬 script 정책 및 `git diff --check`를 모두 PASS 처리했다.
- `node -e` 제품 driver는 브라우저 전역을 만들지 않고 실제 export를 호출해 `setting={enabled:true,mode:'ultimate'}` 및 `crop={sx:90,sy:60,sw:10,sh:20}`를 출력했다.
- LSP는 이 저장소에 TypeScript server가 구성되지 않았고 대체 Biome server도 설치되지 않아, `node --check`와 테스트/제품 driver로 대체 검증했다.
- 실제 unpacked Chrome QA는 이 작업 범위에서 수행하지 않았다.

## Dirty 및 Cleanup 영수증

- 시작 시 보호한 선행 dirty 파일: `content.js`, `crop-overlay.js`, `docs/INDEX.md`, `offscreen.js`, `popup.js`, `right-click-on-web-v0.8.0.zip`, `docs/sessions/20260813_103000_v0.8.0-release-hardening.md`.
- 이 작업은 선행 `offscreen.js` clamp/0영역 오류 변경을 helper로 추출해 보존했으며 다른 선행 dirty 소스와 ZIP은 수정하지 않았다.
- 임시 파일, npm 산출물, 캐시, 원격 다운로드를 생성하지 않아 cleanup 대상은 없다.

## 최종 독립 재검증

- Node export 표면을 `parseDomainSetting`과 `normalizeDomainSettings` 두 함수로만 고정하고, 테스트에서 export key 목록까지 검증했다. Node 분기는 `RIGHT_CLICK_ON_WEB_SHARED`를 만들지 않는다.
- `node --test .\tests\unit\*.test.js` 재실행 결과 `tests 7`, `pass 7`, `fail 0`, `duration_ms 335.2081`이었다.
- `shared.js`, `ocr-image-utils.js`, `offscreen.js`, 두 unit test에 대한 `node --check`가 모두 통과했다.
- 이 저장소 경로를 대상으로 한 파일별 LSP diagnostics 재시도는 네 JavaScript 파일 모두 `No diagnostics found`를 반환했다. 위 44행의 LSP 미연결 기록은 최초 실행 당시 상태이며 이 최종 결과로 대체한다.
- `pwsh -NoProfile -File .\scripts\verify.ps1`는 모든 gate를 PASS하고 `Verification passed.`로 종료했다. 기존 LF/CRLF 경고는 있었지만 파일 정규화는 수행하지 않았다.
- 제품 driver는 export key가 `normalizeDomainSettings,parseDomainSetting`이고 브라우저 전역 누출이 없으며, 실제 helper 결과가 `setting={enabled:true,mode:'ultimate'}`, `bounds={sx:90,sy:60,sw:10,sh:20}`임을 확인했다.

## 전처리 수학 범위 결정

- 현재 제품 OCR 경로에는 grayscale, threshold 또는 Otsu 전처리 함수가 없다. 현 제품에서 직접 검증 가능한 전처리 전 단계 수학은 DPR 반올림과 crop clamp뿐이다.
- Wave 1.2의 실제 전처리 알고리즘을 작업 0.3에서 선행하거나 테스트 전용으로 복제하지 않았다. 대신 `ocr-image-utils.js`를 제품과 Node 테스트가 함께 쓰는 확장 seam으로 유지해, 전처리가 도입될 때 같은 정본을 직접 테스트할 수 있게 했다.

## UltraQA 리뷰

- `ocr review --audience agent`로 관련 제품 변경을 검토했다. Node 테스트는 제품 파일을 직접 import하고 `offscreen.js`는 동일 `calculateCropBounds`를 호출하므로 stale fixture나 테스트 전용 구현 복제가 아니다.
- 리뷰에서 설정 seam 또는 crop/DPR 수학의 차단 결함은 발견되지 않았다. 동기 로드 guard 설명 같은 낮은 우선순위 유지보수 의견은 인라인 주석을 추가하지 않는 프로젝트 지침에 따라 반영하지 않았다.
- 남은 릴리스 위험: 저장소 `AGENTS.md`의 수동 `Compress-Archive` 목록에는 `ocr-image-utils.js`가 없다. `scripts/verify.ps1`은 이 파일을 필수 제품 asset으로 검사하지만, 문서의 수동 명령을 그대로 쓰면 ZIP에서 누락될 수 있다. 작업 0.3의 명시된 수정 범위 밖이므로 이 작업에서는 명령을 변경하지 않았다.
