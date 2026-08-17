# Chrome Web Store 제출 체크리스트

`Right-click on Web` 확장 프로그램을 Chrome Web Store에 배포할 때 필요한 요구사항과 절차를 정리한 문서입니다.

---

## 현재 확장 상태

| 항목 | 현재 상태 | 비고 |
|------|-----------|------|
| **manifest 버전** | MV3 ✅ | |
| **permissions** | `storage`, `activeTab`, `contextMenus`, `sidePanel`, `offscreen` ✅ | 설정·사용자 요청 OCR·메뉴·사이드 패널·로컬 OCR |
| **host_permissions** | `<all_urls>` ⚠️ | 모든 페이지에서 동작 위해 필요 (설명 문구 준비됨) |
| **아이콘** | `icons/icon128.png`, `icons/icon512.png` ✅ | PIL 생성, 레드/블랙/골드 디자인 |
| **스크린샷** | 🔄 기존 제출용 이미지 있음 | v0.10.0 흐름을 담은 실제 unpacked Chrome 캡처는 별도 게이트 |
| **개인정보처리방침** | ✅ 문서 갱신 | 공개 URL 접근성은 제출 전 확인 |
| **content script** | MAIN/ISOLATED 및 이미지 context 엔트리 ✅ | 차단 완화와 사용자 요청 이미지 OCR 좌표 확인 |
| **popup UI** | `popup.html/css/js` ✅ | |
| **스토어 등록 정보** | ✅ 완료 (`docs/store-listing.md`) | 설명/카테고리/권한 사유/데이터 설문 복사본 |

---

## 1) 사전 준비

### 개발자 계정
- [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) 접속
- 등록료 **$5** (1회 결제, 연간 유지비 없음)
- 개발자 프로필: 이름, 이메일, 웹사이트(선택)

### 아이콘 (준비 완료 ✅)
- `icons/icon128.png` — 128×128 PNG (스토어 필수)
- `icons/icon512.png` — 512×512 PNG (스토어 권장)
- 디자인: Rosso Corsa Red / Carbon Black / Gold Concentric Circles

### 스크린샷
- 기존 제출용 `assets/screenshots/test-page.png` 1장이 있습니다.
- 권장 크기: **1280×800** 또는 **640×400** PNG
- v0.10.0 OCR·기록·반복 흐름을 보여 주는 실제 unpacked Chrome 캡처는 별도 수동 QA 게이트에서 준비합니다.

### 개인정보처리방침 URL
- 공개 개인정보처리방침 문서는 `docs/privacy-policy.html`에 갱신되어 있습니다.
- 스토어 제출 전 공개 URL의 실제 접근 가능 여부를 별도로 확인합니다.
- 데이터 사용 설문은 캡처 픽셀·OCR 텍스트의 외부 수집·전송이 없고 OCR 기록이 opt-in local-only임을 기준으로 작성합니다.

---

## 2) 스토어 설명 제안

### 짧은 설명 (최대 50자)
```
막힌 웹 텍스트를 복구하고 선택 불가능한 화면 텍스트를 로컬 OCR로 추출합니다.
```

### 상세 설명 (HTML 허용)

```html
<h2>Right-click on Web</h2>
<p>우클릭, 텍스트 선택, 복사/잘라내기, 드래그 차단을 완화하고 선택할 수 없는 보이는 텍스트를 기기 내 OCR로 추출하는 크롬 확장 프로그램입니다.</p>

<h3>주요 기능</h3>
<ul>
  <li>우클릭 메뉴 복원</li>
  <li>텍스트 선택 허용</li>
  <li>복사/잘라내기/드래그 차단 완화</li>
  <li>팝업과 사이드 패널에서 ON/OFF 및 사이트 설정 관리</li>
  <li>사용자 요청 화면 영역·이미지의 로컬 WASM OCR 텍스트 추출</li>
  <li>기본 OFF인 선택형 로컬 OCR 기록과 같은 수동 영역 새 캡처 반복</li>
</ul>

<h3>제한 사항</h3>
<p>모든 사이트에서 100% 동작을 보장하지 않습니다. DRM, 서버에서 제공하지 않는 텍스트, sandbox iframe, 현재 화면에 보이지 않는 콘텐츠에서는 제한될 수 있습니다.</p>

<h3>권한 설명</h3>
<p>이 확장은 <code>&lt;all_urls&gt;</code> 호스트 권한을 사용하여 차단 스크립트를 완화하고 사용자가 요청한 이미지 OCR 좌표를 확인합니다. OCR은 로컬 WASM으로 실행되며 캡처 픽셀은 처리 중 메모리에만 존재합니다. 원격 전송, 원격 코드 로딩, 텔레메트리, 클라우드 OCR이 없습니다.</p>
```

---

## 3) 권한 설명 전략

스토어 검토 시 "왜 전체 사이트 접근이 필요한지" 설명이 필요할 수 있습니다:

> **`<all_urls>` 필요 이유**: 우클릭/선택/복사 차단은 페이지의 인라인 스크립트나 CSS 속성으로 구현됩니다. 이를 완화하고 사용자가 요청한 이미지 OCR의 가시 좌표를 확인하려면 모든 웹페이지에 Content Script가 주입되어야 합니다.
>
> **`storage`**: 설정, 기본 OFF인 opt-in 로컬 OCR 기록, 세션 상태에 사용합니다. OCR 기록은 최종 텍스트와 제한 메타데이터만 현재 기기에 최대 20개·30일·64 KiB로 저장하며 Chrome Sync에 포함하지 않습니다.
>
> **`activeTab`**: 사용자가 요청한 현재 탭의 hostname·가시 영역 확인 및 OCR 캡처에 사용합니다. **`contextMenus`**는 사용자 요청 메뉴, **`sidePanel`**은 설정·결과·기록 관리, **`offscreen`**은 확장 내부 로컬 WASM OCR 실행에 사용합니다.
>
> **데이터 처리**: 캡처 픽셀은 OCR 중 메모리에만 존재하며 저장·전송하지 않습니다. 원격 서버 전송, 원격 코드 로딩, 텔레메트리, 클라우드 OCR이 없습니다. 마지막 영역 반복은 세션 geometry만 보관하고, 조건 검증 후 새 화면을 캡처합니다.

---

## 4) 패키지 생성

```powershell
# 이 명령을 repo 루트에서 실행 (manifest가 참조하는 모든 로컬 런타임 파일 포함)
Compress-Archive -Path manifest.json,shared.js,ocr-session-utils.js,ocr-history.js,toolbar-action-utils.js,image-context.js,keyboard-utils.js,ocr-image-utils.js,background.js,content.js,content-main.js,crop-overlay.js,crop-overlay.css,offscreen.html,offscreen.js,popup.html,popup.css,popup.js,options.html,options.css,options.js,lib,langs,icons -DestinationPath "right-click-on-web-v0.10.0.zip" -Force
```

**제외할 항목**: `.git`, `.serena`, `.omo`, `history`, `docs`, `tests`, `popup-preview.html`, `README.md`

---

## 5) 제출 전 체크리스트

- [x] Manifest V3 준수 (`manifest_version: 3`)
- [x] manifest 권한·호스트 권한 설명 준비 (`storage`, `activeTab`, `contextMenus`, `sidePanel`, `offscreen`, `<all_urls>`)
- [x] 아이콘 준비 (`icons/icon128.png`, `icons/icon512.png`)
- [x] 듀얼 콘텐츠 스크립트 (`content.js` + `content-main.js`) — ZIP에 반드시 포함
- [x] 개인정보처리방침 파일 작성 (`docs/privacy-policy.html`)
- [ ] 개인정보처리방침 공개 URL 접근성 확인
- [x] 기존 제출용 스크린샷 1장 확인 (`assets/screenshots/test-page.png`, 1280×800)
- [ ] v0.10.0 OCR·기록·반복 흐름의 실제 unpacked Chrome 스크린샷 준비
- [x] 스토어 설명/상세 설명 작성 (`docs/store-listing.md`)
- [ ] ZIP 루트에 `manifest.json` 확인
- [ ] 실제 unpacked Chrome에서 v0.10.0 OCR·기록 opt-in·마지막 영역 반복 수동 QA 완료
- [ ] manifest v0.10.0 출시 버전 확인

---

## 6) 심사 거절 주요 사유 참고

- 과도한 권한 요청 (불필요한 `<all_urls>` 설명 부족)
- 스토어 설명과 실제 동작 불일치
- 개인정보처리방침 URL 누락
- 외부 코드 로딩, 난독화, 숨김 동작 포함
- 저작권/상표 문제가 있는 아이콘/설명 (우리 확장은 Ferrari 공식 상표 사용 안 함 ✅)

---

## 다음 단계

상세한 단계별 계획은 `docs/store-submission-plan.md`을 참고하세요.

### 대략적인 순서

1. **기존 제출용 스크린샷 확인** → `assets/screenshots/test-page.png` (1280×800); v0.10.0 흐름 스크린샷은 별도 수동 QA 게이트에서 캡처
2. **개인정보처리방침** → GitHub Pages로 호스팅, URL 확보
3. **스토어 설명** → Dashboard에 입력
4. **manifest version** → v0.10.0 출시 값 확인
5. **ZIP 패키지** → `right-click-on-web-v0.10.0.zip` 생성
6. **Developer Dashboard** → 제출 및 승인 대기
