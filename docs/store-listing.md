# Chrome Web Store 등록 정보 (v0.10.0 출시 준비용)

> 이 문서는 Developer Dashboard 입력용 최종 복사본입니다. 각 항목을 대시보드에 그대로 붙여넣으면 됩니다.
> ZIP 패키징 시 manifest가 참조하는 모든 로컬 런타임 파일을 포함하세요 (현재 목록은 아래 §8 및 `AGENTS.md` 참조).

---

## 1. 기본 정보

| 항목 | 값 |
|------|-----|
| **이름 (Name)** | Right-click on Web |
| **버전 (Version)** | 0.10.0 출시 대상 (업로드 전 `manifest.json` 값 확인) |
| **카테고리** | 생산성 (Productivity) |
| **언어** | 한국어 (+ 영어 manifest description) |
| **단일 목적 (Single Purpose)** | 막힌 웹 텍스트를 복구하고 선택 불가능한 화면 텍스트를 로컬 OCR로 추출 |

---

## 2. 짧은 설명 (Short Description, 132자 이내)

```
막힌 웹 텍스트를 복구하고 선택 불가능한 화면 텍스트를 로컬 OCR로 추출합니다.
```

---

## 3. 상세 설명 (Detailed Description, HTML 허용)

```html
<h2>Right-click on Web</h2>
<p>우클릭, 텍스트 선택, 복사/잘라내기, 드래그 차단을 완화하고 선택할 수 없는 보이는 텍스트를 기기 내 OCR로 추출하는 크롬 확장 프로그램입니다.</p>

<h3>주요 기능</h3>
<ul>
  <li>우클릭 메뉴 복원 (contextmenu)</li>
  <li>텍스트 선택 허용 (selectstart, user-select CSS)</li>
  <li>복사/잘라내기/붙여넣기 차단 완화 (copy, cut, paste)</li>
  <li>이미지·텍스트 드래그 복원 (dragstart)</li>
  <li>오른쪽 버튼 입력 차단 완화 및 정상 클릭·터치 동작 보존</li>
  <li>차단용 투명 오버레이 무력화 (pointer-events)</li>
  <li>Closed Shadow DOM 내부 차단 요소 제거 (attachShadow 패치)</li>
  <li>페이지가 차단 스크립트를 다시 추가해도 5초마다 자동 재검사</li>
  <li>팝업에서 전역·현재 사이트 ON/OFF 및 세션 임시 활성화</li>
  <li>Lite/Ultimate 완화 모드와 전체 사이트 설정 대시보드</li>
  <li>사용자가 선택한 화면 영역 또는 이미지에서 로컬 WASM OCR 텍스트 추출</li>
  <li>선택형 로컬 OCR 기록: 기본 OFF, 최종 텍스트와 제한 메타데이터만 현재 기기에 보관</li>
  <li>같은 수동 영역 다시 인식: 세션 geometry를 검증한 뒤 현재 화면을 새로 캡처</li>
  <li>Chrome 사이드 패널에서 페이지를 보면서 도메인 설정·OCR 결과·선택형 기록 관리</li>
</ul>

<h3>제한 사항</h3>
<p>모든 사이트에서 100% 동작을 보장하지 않습니다. DRM/보호 미디어, 서버 측에서 텍스트를 보내지 않는 페이지, sandbox iframe, 현재 화면에 보이지 않는 콘텐츠에서는 제한될 수 있습니다. OCR은 사용자가 요청한 현재 보이는 영역 또는 이미지에 한정됩니다.</p>

<h3>권한 안내</h3>
<p>이 확장은 모든 웹페이지에서 차단 스크립트를 완화하고 사용자가 요청한 이미지 OCR 좌표를 확인하기 위해 호스트 권한(&lt;all_urls&gt;)을 사용합니다. OCR은 기기 내 로컬 WASM으로 실행하며 화면 픽셀은 처리 중 메모리에만 존재하고 저장·전송되지 않습니다. 원격 코드 로딩, 텔레메트리, 클라우드 OCR, 화면 콘텐츠 업로드가 없습니다. OCR 기록은 기본 OFF이며, 사용자가 켠 경우에만 최종 텍스트와 제한 메타데이터를 chrome.storage.local에 최대 20개·30일·64 KiB까지 저장하고 동기화하지 않습니다.</p>
```

---

## 4. 권한 사유 설명 (Permission Justification)

> **host_permissions `<all_urls>` 필요 이유**: 우클릭/선택/복사 차단은 페이지의 인라인 스크립트, CSS 속성, 이벤트 리스너로 구현됩니다. 이를 완화하고 사용자가 요청한 이미지 OCR의 가시 좌표를 확인하려면 방문 페이지에 콘텐츠 스크립트가 주입되어야 하므로 전체 호스트 권한이 필요합니다.
>
> **기타 권한**: `storage`는 설정·선택형 로컬 기록·세션 상태, `activeTab`은 사용자가 요청한 활성 탭 확인·캡처, `contextMenus`는 사용자 요청 메뉴, `sidePanel`은 설정·결과 관리, `offscreen`은 확장 내부 로컬 OCR 실행에 사용합니다.
>
> **데이터 처리**: 원격 서버 전송·원격 코드 로딩·텔레메트리·클라우드 OCR 없음. 캡처 픽셀은 OCR 중 메모리에만 존재하며 저장·전송되지 않습니다. 기본 OFF인 OCR 기록은 opt-in 시 최종 텍스트와 제한 메타데이터만 `chrome.storage.local`에 저장하고 동기화하지 않습니다.

---

## 5. 데이터 사용 설문 (Data Usage / Data Practices)

화면 캡처·OCR 텍스트를 개발자 또는 제3자에게 수집·전송하지 않으므로, 해당되는 모든 개발자·제3자 대상 외부 수집/공유 항목은 **[수집하지 않음]** / **[아니오]**로 답합니다. 사용자가 opt-in한 OCR 기록은 최종 텍스트와 제한 메타데이터를 현재 기기의 `chrome.storage.local`에만 저장하며 외부 수집·전송이 아닙니다.

| 질문 | 응답 |
|------|------|
| 사용자 데이터 수집/전송 | 아니오 |
| 개인 식별 정보(PII) 수집 | 아니오 |
| 위치 정보 수집 | 아니오 |
| 브라우징 활동 추적 | 아니오 |
| 인증/로그인 처리 | 아니오 |
| 판매 목적의 데이터 처리 | 아니오 |

---

## 6. 개인정보처리방침 (Privacy Policy)

- 파일: `docs/privacy-policy.html` (repo 내 작성 완료)
- 공개 URL 예시: `https://chrythjin.github.io/Right-click-on-web/privacy-policy.html`
- 공개 URL 접근성: 제출 전 별도 확인 필요

---

## 7. 스크린샷

| 파일 | 규격 | 상태 |
|------|------|------|
| `assets/screenshots/popup-ui.png` | 1280×800 또는 640×400 PNG | ❌ 캡처 필요 |
| `assets/screenshots/test-page.png` | 1280×800 PNG | ✅ 제출 가능 |

캡처 방법: Load unpacked → popup 열기 (Win+Shift+S), `tests/manual/blocked-page.html` 열어 확장 ON 상태에서 캡처.

---

## 8. ZIP 패키징 명령 (content-main.js 포함 — 필수!)

```powershell
Compress-Archive -Path manifest.json,shared.js,ocr-session-utils.js,ocr-history.js,toolbar-action-utils.js,image-context.js,keyboard-utils.js,ocr-image-utils.js,background.js,content.js,content-main.js,crop-overlay.js,crop-overlay.css,offscreen.html,offscreen.js,popup.html,popup.css,popup.js,options.html,options.css,options.js,lib,langs,icons -DestinationPath "right-click-on-web-v0.10.0.zip" -Force
```

**제외**: `.git`, `.serena`, `.omo`, `history`, `docs`, `tests`, `popup-preview.html`, `README.md`

---

## 9. 제출 전 최종 체크리스트

- [x] Manifest V3 (`manifest_version: 3`)
- [x] manifest 권한 설명 준비 (`storage`, `activeTab`, `contextMenus`, `sidePanel`, `offscreen` + `<all_urls>` 호스트 권한)
- [x] 아이콘 (`icons/icon128.png`, `icons/icon512.png`)
- [x] 듀얼 콘텐츠 스크립트 (`content.js` + `content-main.js` — 둘 다 manifest에 선언)
- [x] 개인정보처리방침 파일 작성 (`docs/privacy-policy.html`)
- [ ] 개인정보처리방침 공개 URL 접근성 확인
- [x] 스크린샷 1장 이상 (`assets/screenshots/test-page.png`, 1280×800)
- [ ] v0.10.0 ZIP 생성 및 manifest 파일 목록 대조
- [ ] v0.10.0 manifest 버전 확인
- [ ] Developer Dashboard 등록 및 제출
