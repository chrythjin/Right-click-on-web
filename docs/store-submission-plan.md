# Chrome Web Store 제출 계획서

`Right-click on Web`를 Chrome Web Store에 출시하기 위한 단계별 작업 계획입니다.

---

## 진행 현황

| # | 작업 | 상태 |
|---|------|------|
| 1 | 스토어 제출 체크리스트 계획서 작성 | ✅ 완료 |
| 2 | 스크린샷 캡처 (popup + 테스트 페이지) | ✅ 제출용 `assets/screenshots/test-page.png` 1280×800 확보 |
| 3 | 개인정보처리방침 페이지 작성 + 호스팅 | 🔄 문서 갱신 완료, 공개 URL 접근성은 제출 전 확인 |
| 4 | 스토어 설명 (짧은 설명 + 상세 설명) 작성 | ✅ 완료 (`docs/store-listing.md`) |
| 5 | 카테고리/설정값 결정 및 manifest/origin 정리 | 🔄 카테고리=Productivity, v0.10.0 권한·데이터 설명 대조 필요 |
| 6 | ZIP 패키지 생성 및 최종 검증 | ⬜ v0.10.0 manifest 런타임 파일 기준으로 새 패키지 생성 필요 |
| 7 | Developer Dashboard 제출 준비 완료 | ⬜ 계정 인증 후 업로드·제출 |

---

## 작업 1: 스토어 제출 체크리스트 계획서 작성 ✅ (지금 완료)

이 문서입니다. 모든 후속 작업의 기준이 됩니다.

---

## 작업 2: 스크린샷 캡처

### 필요한 스크린샷
- **최소 1장** (스토어 규격: 1280×800 또는 640×400 PNG)
- **추천**: 팝업 UI 캡처 1장 + 테스트 페이지 동작 캡처 1장

### 캡처 방법
1. Chrome에서 `chrome://extensions` 열기 → 개발자 모드 ON → 이 폴더 Load unpacked
2. 팝업 캡처: 확장 아이콘 클릭 → 화면 캡처 (Win: `Win+Shift+S` / macOS: `Cmd+Shift+4`)
3. 테스트 페이지 캡처: `C:\NEW PRG\Right-click-on-web\tests\manual\blocked-page.html` 열기 → 확장 ON 상태에서 캡처
4. 캡처 이미지를 `assets/screenshots/` 폴더에 PNG로 저장

### 출력 파일 (예상)
```
assets/screenshots/popup-ui.png      # 1280x800 또는 640x400
assets/screenshots/test-page.png     # 1280x800 또는 640x400
```

---

## 작업 3: 개인정보처리방침 페이지 작성 + 호스팅

### 현황
- 확장은 원격 통신, 원격 코드 로딩, 텔레메트리, 클라우드 OCR 없음
- OCR 캡처 픽셀은 로컬 OCR 처리 중 메모리에만 존재하며 저장·전송하지 않음
- OCR 기록은 기본 OFF이며 opt-in 시에만 최종 텍스트와 제한 메타데이터를 현재 기기에 저장
- 스토어 "데이터 사용 관련 설문" 항목 대응 필요
- 자체 호스팅 또는 무료 서비스로 URL 확보 필요

### 대안별 비교

| 방법 | 장점 | 단점 |
|------|------|------|
| **GitHub Pages** | 무료, 간단, HTTPS | 저장소 공개 필요 |
| **Cloudflare Pages** | 무료, HTTPS, 빠른 배포 | 별도 계정 필요 |
| **자체 서버** | 완전한 제어 | 서버 필요 |
| **RAW GitHub** | 즉시 가능 | HTTPS 문제, 안정성 낮음 |

### 권장: GitHub Pages (이미 repo가 GitHub에 연결되어 있음)
- repo: `https://github.com/chrythjin/Right-click-on-web`
- Pages 활성화 → `docs/privacy-policy.html`을 루트로 serving
- URL 예: `https://chrythjin.github.io/Right-click-on-web/privacy-policy.html`

### 최소 개인정보처리방침 내용
```html
<h1>개인정보처리방침</h1>
<p>Right-click on Web Chrome 확장 프로그램</p>
<ul>
  <li>화면 캡처는 로컬 OCR 처리 중 메모리에만 존재하며 저장·전송하지 않음</li>
  <li>원격 서버 전송, 원격 코드 로딩, 텔레메트리, 클라우드 OCR 없음</li>
  <li>설정은 chrome.storage.sync/local에 저장하며, OCR 기록은 기본 OFF이고 opt-in 시 chrome.storage.local에만 저장</li>
  <li>마지막 영역 반복은 session geometry만 사용하고 이전 이미지 바이트·OCR 텍스트를 저장하지 않음</li>
</ul>
<p>문의: [이메일 또는 GitHub Issues]</p>
```

### 출력이 될 것
- `docs/privacy-policy.html` 파일 작성
- GitHub Pages 활성화 후 URL 확보
- URL을 `docs/chrome-web-store-requirements.md`에 기재

---

## 작업 4: 스토어 설명 작성

### 짧은 설명 (30~50자)
```
막힌 웹 텍스트를 복구하고 선택 불가능한 화면 텍스트를 로컬 OCR로 추출합니다.
```

### 상세 설명 (HTML)
아래 HTML을 Developer Dashboard에 붙여넣기:
```html
<h2>Right-click on Web</h2>
<p>우클릭, 텍스트 선택, 복사/잘라내기, 드래그 차단을 완화하고 선택할 수 없는 보이는 텍스트를 로컬 OCR로 추출하는 크롬 확장 프로그램입니다.</p>

<h3>주요 기능</h3>
<ul>
  <li>우클릭 메뉴 복원</li>
  <li>텍스트 선택 허용</li>
  <li>복사/잘라내기/드래그 차단 완화</li>
  <li>팝업과 사이드 패널에서 ON/OFF 및 사이트 설정 관리</li>
  <li>사용자 요청 화면 영역·이미지의 기기 내 OCR 텍스트 추출</li>
  <li>기본 OFF인 선택형 로컬 OCR 기록과 같은 수동 영역 새 캡처 반복</li>
</ul>

<h3>제한 사항</h3>
<p>모든 사이트에서 100% 동작을 보장하지 않습니다. DRM, 서버에서 제공하지 않는 텍스트, sandbox iframe, 현재 화면에 보이지 않는 콘텐츠에서는 제한될 수 있습니다.</p>

<h3>권한 설명</h3>
<p>이 확장은 차단 완화와 사용자가 요청한 이미지 OCR 좌표 확인을 위해 호스트 권한을 사용합니다. OCR은 로컬 WASM으로 실행되며 캡처 픽셀은 처리 중 메모리에만 존재합니다. 원격 전송·원격 코드·텔레메트리·클라우드 OCR이 없고, OCR 기록은 기본 OFF이며 opt-in 시에만 현재 기기에 저장됩니다.</p>
```

### 카테고리 추천
- **Productivity** (생산성) — 가장 적격
- 대체: Utilities, Tools

---

## 작업 5: 카테고리/설정값 결정 및 manifest 정리

### manifest.json 최종 점검
- `version`: v0.10.0 출시 값
- `description`: 영문 manifest 설명과 한국어 스토어 설명을 각각 사용
- `action.default_icon`: 방금 만든 마우스 아이콘 연결됨 ✅

### Developer Dashboard에서 입력할 내용
| 항목 | 값 |
|------|-----|
| **확장 이름** | Right-click on Web |
| **짧은 설명** | 막힌 웹 텍스트를 복구하고 선택 불가능한 화면 텍스트를 로컬 OCR로 추출합니다. |
| **카테고리** | Productivity |
| **visibility** | 비공개(테스트) → 전체 공개(승인 후) |

---

## 작업 6: ZIP 패키지 생성 + 최종 검증

### 패키지 명령
```powershell
# repo 루트에서 실행 (manifest가 참조하는 모든 로컬 런타임 파일 포함)
Compress-Archive -Path manifest.json,shared.js,ocr-session-utils.js,ocr-history.js,toolbar-action-utils.js,image-context.js,keyboard-utils.js,ocr-image-utils.js,background.js,content.js,content-main.js,crop-overlay.js,crop-overlay.css,offscreen.html,offscreen.js,popup.html,popup.css,popup.js,options.html,options.css,options.js,lib,langs,icons -DestinationPath "right-click-on-web-v0.10.0.zip" -Force
```

### 최종 검증 체크리스트
- [x] ZIP 루트에 `manifest.json` 위치 확인
- [x] `icons/icon128.png`, `icons/icon512.png` 포함
- [x] `.git`, `.serena`, `.omo`, `.codegraph`, `.playwright-mcp`, `history`, `docs`, `tests`, `assets`, `popup-preview.html`, `README.md`, `AGENTS.md` 제외됨
- [ ] manifest `version`: v0.10.0 출시 값 확인
- [x] `permissions`: `storage`, `activeTab`, `contextMenus`, `sidePanel`, `offscreen`
- [x] `host_permissions`: `<all_urls>`

### 제출용 파일
```
right-click-on-web-v0.10.0.zip   # 스토어에 업로드할 패키지
```

---

## 작업 7: Developer Dashboard 제출 준비

### 사전 확인
- [ ] Chrome Web Store Developer 계정 등록 ($5 결제 완료)
- [x] 스크린샷 1장 이상 준비됨 (`assets/screenshots/test-page.png`)
- [ ] 개인정보처리방침 공개 URL 접근성 확인
- [x] 스토어 설명 작성됨
- [ ] v0.10.0 ZIP 패키지 생성 및 내용 대조

### 제출 단계
1. [Developer Dashboard](https://chrome.google.com/webstore/devconsole) 접속 → 새 항목
2. ZIP 파일 업로드
3. 스크린샷 추가
4. 개인정보처리방침 URL 입력
5. 설명 입력 (짧은 설명 + 상세 설명)
6. 데이터 사용 설문 답변 (개발자·제3자 대상 외부 수집/전송 항목은 "아니오". opt-in OCR 기록은 현재 기기에만 저장됨)
7. 검토 요청 제출

### 승인 후
- version 올려서 업데이트 제출 → 자동 업데이트 배포

---

## 체크리스트 요약

### 지금 바로 시작 가능 (사용자 작업)
- [ ] 개인정보처리방침 공개 URL 접근성 확인
- [x] 제출 규격 스크린샷 확보 (`assets/screenshots/test-page.png`)

### 내가 진행할 수 있음 (자동화 가능)
- [x] 스토어 설명 HTML 작성 → `docs/store-listing.md`에 저장
- [ ] v0.10.0 manifest version 확인
- [ ] ZIP 패키지 생성 (manifest 런타임 파일 전체 포함)
- [x] 체크리스트 문서 최종 동기화

### 순서
```
2 (스크린샷) + 3 (개인정보처리방침 호스팅)  →  4 (설명 ✅)  →  5 (manifest)  →  6 (ZIP)  →  7 (제출)
```
문서와 제출 문구는 v0.10.0 데이터 처리 계약에 맞췄습니다. 실제 manifest 버전 확정, ZIP 생성, unpacked Chrome 수동 QA, 계정 인증·업로드·제출은 별도 릴리스 게이트입니다.
