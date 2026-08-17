# 작업 3.1 이미지 우클릭 좌표 캡처 채널

## 목적

이미지 우클릭 메뉴에서 URL이나 이미지 바이트를 읽거나 보관하지 않고, 기존 `captureVisibleTab` 기반 로컬 OCR 경로로 이미지의 화면상 영역을 전달한다.

## 구현

- `image-context.js`를 MAIN 패치 바로 다음이자 `shared.js`/`content.js`보다 앞선 독립 ISOLATED `document_start` content script로 등록했다. 이 순서로 이미지 document-capture 관찰자가 `content.js`의 `stopImmediatePropagation()` 인터셉터보다 먼저 설치된다. 최상위 프레임과 same-origin 중첩 프레임에서 이미지의 CSS rect를 상위 viewport 좌표로 누적 변환하고, 각 frame 및 최상위 viewport에 교차시킨다.
- cross-origin, sandbox/opaque 접근 오류, 연결 해제 이미지, 0-size/viewport 밖 rect는 `manualCropRequired:true`를 전송한다. 좌표 변환에는 child frame DPR을 사용하지 않으며, OCR에는 top frame의 DPR만 보낸다.
- background worker는 sender tab URL에서만 얻은 정규화 hostname과 `tabId:frameId` 키의 3초 runtime cache에 timestamp, rect, fallback 상태만 저장한다. `srcUrl`, data URL, 캡처, 페이지/OCR 텍스트는 cache에 저장하지 않는다.
- `이미지에서 텍스트 추출 (OCR)` 이미지 전용 context menu는 클릭 시 `info.srcUrl`, 현재 tab/frame cache, hostname, TTL을 확인한다. 자동 좌표는 content script에서 즉시 다시 측정해 ±2 CSS px를 초과하면 거부한다. 모든 거부 경우에는 `이미지 위치를 자동으로 확인할 수 없어 화면에서 영역을 직접 선택하세요.` 안내와 함께 기존 일반 영역 OCR을 연다.

## 검증

- `node --test tests/unit/image-context.test.js`: 8개 통과. manifest 회귀 테스트는 MAIN 항목이 0번임을 유지하면서 이미지 관찰 항목이 `content.js` 항목보다 앞서고, 두 ISOLATED 항목의 all-frame/document-start/fallback coverage가 유지됨을 실행 가능하게 단언한다.
- `node --test tests/unit/*.test.js`: 272개 통과. nested frame transform/clip, invalid rect, TTL, fallback, scroll mismatch, URL 비보존 및 수정된 manifest 순서를 실제 `image-context.js` API와 제품 소스에 대해 확인한다.
- `node --check tests/unit/image-context.test.js`: 통과. `scripts/verify.ps1`은 8개 검사를 모두 통과했고 `git diff --check`도 exit 0으로 통과했다.
- LSP blast radius는 client 미초기화로 실행할 수 없어 Node 및 repository verifier로 대체했다.
- 이 작업 환경에는 unpacked extension이 연결된 Chrome DevTools target이 없어 실제 context menu 수동 QA는 수행하지 못했다. 자동 검증은 완료했으며, 배포 전 Chrome에서 최상위 이미지, same-origin iframe, cross-origin iframe fallback을 확인해야 한다.
