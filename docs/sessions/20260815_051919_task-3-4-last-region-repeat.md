# 작업 3.4 마지막 영역 반복 OCR

## 목적

마지막으로 성공한 수동 `source=region` OCR 영역만 현재 화면에서 새로 캡처해 다시 인식한다. 이 동작은 이미지 OCR 결과나 이전 캡처 바이트를 재사용하지 않으며, unpacked Chrome 및 v0.9.1 배포 수동 게이트와는 독립적으로 자동 검증한다.

## 구현

- `ocr-session-utils.js`에 `lastRegionRerun` 전용 allowlisted 정규화 경계를 추가했다. 저장 객체는 `tabId`, hostname, viewport width/height, rect, DPR, source, timestamp 새 객체만 포함하며 URL, path/query, data URL, 이미지, OCR 텍스트와 임의 필드는 배제한다.
- `background.js`는 OCR 성공의 단조 request/result 상태가 최신 요청일 때만 `source=region` 메타데이터를 `chrome.storage.session.lastRegionRerun`에 기록한다. `source=image` 성공은 마지막 반복 가능 영역을 덮어쓰지 않는다.
- 반복 요청은 session storage 존재, active tab과 hostname, viewport width/height, DPR, rect bounds, 24시간 TTL을 `captureVisibleTab` 전에 검증한다. 거부 시 Korean 오류를 반환하고 캡처하지 않는다. 성공 시 공통 `captureAndOcr()` 경로로 새 `captureVisibleTab`을 사용하며 `region` source 계약과 requestId 단조성을 보존한다.
- options/side-panel의 기존 “마지막 영역 다시 인식” 버튼은 준비 전 비활성 설명을 보이고, 준비되면 새 캡처임과 image OCR이 repeat 영역을 바꾸지 않음을 설명한다. 자동 주기 반복이나 기본 단축키는 추가하지 않았다.

## 검증

- `node --test tests/unit/ocr-session-utils.test.js tests/unit/toolbar-action-background.test.js`: 44개 통과, 0개 실패. tabId, hostname, viewport width/height, DPR, TTL, malformed/out-of-bounds rect, missing session storage, rejected-no-capture, image non-overwrite, fresh-capture success를 검증했다.
- `node --test tests/unit/*.test.js`: 294개 통과, 0개 실패.
- `node --check background.js; node --check ocr-session-utils.js; node --check options.js; node --check tests/unit/ocr-session-utils.test.js; node --check tests/unit/toolbar-action-background.test.js`: 통과.
- `& .\scripts\verify.ps1 -RootPath (Get-Location)`: 7개 검사 통과.
- `git diff --check`: exit 0. 기존 LF-to-CRLF 경고만 출력되었고 줄바꿈 정규화는 하지 않았다.
- `agent-lsp_blast_radius`는 `LSP client not initialized`로 사용할 수 없었다. 제품 helper 및 background VM 단위 테스트와 위 정적 검증으로 대체했다.
- 승인된 unpacked Chrome DevTools 대상이 없어 실제 options/side-panel의 반복 버튼, 탭 이동/확대 비율 거부, 새 화면 재캡처를 수동 관찰하지 않았다. 실제 unpacked Chrome 및 v0.9.1 배포 게이트는 별도 차단 상태로 유지한다.
- `ocr review`는 전체 누적 dirty diff를 검토하다 외부 서비스 rate limit으로 120초 후 종료되어 결과를 내지 못했다.
