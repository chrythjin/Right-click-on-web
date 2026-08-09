# Chrome Web Store 제출 계획서

`Right-click on Web`를 Chrome Web Store에 출시하기 위한 단계별 작업 계획입니다.

---

## 진행 현황

| # | 작업 | 상태 |
|---|------|------|
| 1 | 스토어 제출 체크리스트 계획서 작성 | ✅ 완료 |
| 2 | 스크린샷 캡처 (popup + 테스트 페이지) | ✅ 제출용 `assets/screenshots/test-page.png` 1280×800 확보 |
| 3 | 개인정보처리방침 페이지 작성 + 호스팅 | ✅ GitHub Pages 공개 URL 확인 |
| 4 | 스토어 설명 (짧은 설명 + 상세 설명) 작성 | ✅ 완료 (`docs/store-listing.md`) |
| 5 | 카테고리/설정값 결정 및 manifest/origin 정리 | ✅ 카테고리=Productivity, 출시 버전=0.6.1 확정 |
| 6 | ZIP 패키지 생성 및 최종 검증 | ✅ `right-click-on-web-v0.6.1.zip` 생성·검증 완료 |
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
- 확장 자체는 원격 통신/데이터 수집 없음
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
  <li>사용자 데이터 수집 없음</li>
  <li>원격 서버 전송 없음</li>
  <li>모든 설정은 로컬 chrome.storage에만 저장</li>
  <li>브라우징 내용이나 입력 내용을 수집하지 않음</li>
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
우클릭, 선택, 복사 방해를 일반 웹으로 되돌립니다.
```

### 상세 설명 (HTML)
아래 HTML을 Developer Dashboard에 붙여넣기:
```html
<h2>Right-click on Web</h2>
<p>우클릭, 텍스트 선택, 복사/잘라내기, 드래그 차단을 완화하는 크롬 확장 프로그램입니다.</p>

<h3>주요 기능</h3>
<ul>
  <li>우클릭 메뉴 복원</li>
  <li>텍스트 선택 허용</li>
  <li>복사/잘라내기/드래그 차단 완화</li>
  <li>팝업에서 ON/OFF 토글</li>
</ul>

<h3>제한 사항</h3>
<p>모든 사이트에서 100% 동작을 보장하지 않습니다. DRM, 이미지/캔버스 텍스트, 강하게 격리된 iframe 등에서는 제한될 수 있습니다.</p>

<h3>권한 설명</h3>
<p>이 확장은 모든 웹페이지에서 차단 스크립트를 완화하기 위해 호스트 권한을 사용합니다. 원격 서버에 데이터를 전송하거나 사용자 브라우징 데이터를 수집하지 않습니다.</p>
```

### 카테고리 추천
- **Productivity** (생산성) — 가장 적격
- 대체: Utilities, Tools

---

## 작업 5: 카테고리/설정값 결정 및 manifest 정리

### manifest.json 최종 점검
- `version`: `0.6.1`
- `description`: 영문 manifest 설명과 한국어 스토어 설명을 각각 사용
- `action.default_icon`: 방금 만든 마우스 아이콘 연결됨 ✅

### Developer Dashboard에서 입력할 내용
| 항목 | 값 |
|------|-----|
| **확장 이름** | Right-click on Web |
| **짧은 설명** | 우클릭, 선택, 복사 방해를 일반 웹으로 되돌립니다. |
| **카테고리** | Productivity |
| **visibility** | 비공개(테스트) → 전체 공개(승인 후) |

---

## 작업 6: ZIP 패키지 생성 + 최종 검증

### 패키지 명령
```powershell
# repo 루트에서 실행 (content-main.js 포함 필수 — v0.2.0 듀얼 스크립트)
Compress-Archive -Path manifest.json,shared.js,background.js,content.js,content-main.js,popup.html,popup.css,popup.js,options.html,options.css,options.js,icons -DestinationPath "right-click-on-web-v0.6.1.zip" -Force
```

### 최종 검증 체크리스트
- [x] ZIP 루트에 `manifest.json` 위치 확인
- [x] `icons/icon128.png`, `icons/icon512.png` 포함
- [x] `.git`, `.serena`, `.omo`, `.codegraph`, `.playwright-mcp`, `history`, `docs`, `tests`, `assets`, `popup-preview.html`, `README.md`, `AGENTS.md` 제외됨
- [x] manifest `version`: `0.6.1`
- [x] `permissions`: `storage`, `activeTab`, `contextMenus`, `sidePanel`
- [x] `host_permissions`: `<all_urls>`

### 제출용 파일
```
right-click-on-web-v0.6.1.zip   # 스토어에 업로드할 패키지
```

---

## 작업 7: Developer Dashboard 제출 준비

### 사전 확인
- [ ] Chrome Web Store Developer 계정 등록 ($5 결제 완료)
- [x] 스크린샷 1장 이상 준비됨 (`assets/screenshots/test-page.png`)
- [x] 개인정보처리방침 URL 확보됨
- [x] 스토어 설명 작성됨
- [x] ZIP 패키지 생성됨 (`right-click-on-web-v0.6.1.zip`)

### 제출 단계
1. [Developer Dashboard](https://chrome.google.com/webstore/devconsole) 접속 → 새 항목
2. ZIP 파일 업로드
3. 스크린샷 추가
4. 개인정보처리방침 URL 입력
5. 설명 입력 (짧은 설명 + 상세 설명)
6. 데이터 사용 설문 답변 (모두 "아니오" — 원격 통신/수집 없음이므로)
7. 검토 요청 제출

### 승인 후
- version 올려서 업데이트 제출 → 자동 업데이트 배포

---

## 체크리스트 요약

### 지금 바로 시작 가능 (사용자 작업)
- [x] GitHub Pages 활성화 → 개인정보처리방침 URL 확보
- [x] 제출 규격 스크린샷 확보 (`assets/screenshots/test-page.png`)

### 내가 진행할 수 있음 (자동화 가능)
- [x] 스토어 설명 HTML 작성 → `docs/store-listing.md`에 저장
- [x] manifest version `0.6.1` 확정
- [x] ZIP 패키지 생성 (`content-main.js` 포함)
- [x] 체크리스트 문서 최종 동기화

### 순서
```
2 (스크린샷) + 3 (개인정보처리방침 호스팅)  →  4 (설명 ✅)  →  5 (manifest)  →  6 (ZIP)  →  7 (제출)
```
작업 2~6은 완료됐으며, 남은 작업 7은 Chrome Web Store 계정 인증 후 업로드·제출입니다.
