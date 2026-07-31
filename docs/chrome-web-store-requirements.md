# Chrome Web Store 제출 체크리스트

`Right-click on Web` 확장 프로그램을 Chrome Web Store에 배포할 때 필요한 요구사항과 절차를 정리한 문서입니다.

---

## 현재 확장 상태

| 항목 | 현재 상태 | 비고 |
|------|-----------|------|
| **manifest 버전** | MV3 ✅ | |
| **permissions** | `storage` ✅ | 사용자 설정만 저장 |
| **host_permissions** | `<all_urls>` ⚠️ | 모든 페이지에서 동작 위해 필요 (설명 문구 준비됨) |
| **아이콘** | `icons/icon128.png`, `icons/icon512.png` ✅ | PIL 생성, 레드/블랙/골드 디자인 |
| **스크린샷** | ❌ 미준비 | 스토어 등록 전 필요 (사용자 캡처) |
| **개인정보처리방침** | 🔄 파일 작성 완료 (`docs/privacy-policy.html`) / 호스팅 URL 확보는 사용자 작업 | GitHub Pages 활성화 필요 |
| **content script** | `content.js` + `content-main.js` ✅ | v0.2.0 듀얼 스크립트 (ISOLATED + MAIN world) |
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

### 스크린샷 (미준비 ❌)
- 최소 1장 이상 필요
- 권장 크기: **1280×800** 또는 **640×400** PNG
- 팝업 UI 캡처 또는 확장 동작 시연 이미지
- `tests/manual/blocked-page.html`을 브라우저에서 열어 캡처 가능

### 개인정보처리방침 URL (미준비 ❌)
- 확장앱이 사용자 데이터 수집/외부 통신/로그인 처리 시 필수
- 현재 확장: 원격 통신 없음, 사용자 데이터 수집 없음
- 하지만 스토어 검토 시 "데이터 사용 관련 설문" 항목에 대응 필요
- 대안: GitHub Pages나 자체 서버에 간단한 개인정보처리방침 페이지 호스팅

---

## 2) 스토어 설명 제안

### 짧은 설명 (최대 50자)
```
우클릭, 선택, 복사 방해를 일반 웹 상호작용으로 되돌립니다.
```

### 상세 설명 (HTML 허용)

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
<p>이 확장은 <code>&lt;all_urls&gt;</code> 호스트 권한을 사용하여 모든 웹페이지에서 차단 스크립트를 완화합니다. 원격 서버에 데이터를 전송하거나 사용자 브라우징 데이터를 수집하지 않습니다.</p>
```

---

## 3) 권한 설명 전략 (host_permissions `<all_urls>`)

스토어 검토 시 "왜 전체 사이트 접근이 필요한지" 설명이 필요할 수 있습니다:

> **필요 이유**: 우클릭/선택/복사 차단은 페이지의 인라인 스크립트나 CSS 속성으로 구현됩니다. 이를 완화하려면 모든 웹페이지에 Content Script가 주입되어야 합니다.
>
> **데이터 처리**: 이 확장은 원격 서버에 데이터를 전송하지 않으며, 사용자 브라우징 데이터나 입력 내용을 수집/저장하지 않습니다. 설정은 로컬 `chrome.storage`에만 저장됩니다.

---

## 4) 패키지 생성

```powershell
# 이 명령을 repo 루트에서 실행 (content-main.js 포함 필수 — v0.2.0 듀얼 스크립트)
Compress-Archive -Path manifest.json,background.js,content.js,content-main.js,popup.html,popup.css,popup.js,icons -DestinationPath "right-click-on-web.zip" -Force
```

**제외할 항목**: `.git`, `.serena`, `.omo`, `history`, `docs`, `tests`, `popup-preview.html`, `README.md`

---

## 5) 제출 전 체크리스트

- [x] Manifest V3 준수 (`manifest_version: 3`)
- [x] 최소 권한 (`storage` + `<all_urls>`만 사용)
- [x] 아이콘 준비 (`icons/icon128.png`, `icons/icon512.png`)
- [x] 듀얼 콘텐츠 스크립트 (`content.js` + `content-main.js`) — ZIP에 반드시 포함
- [x] 개인정보처리방침 파일 작성 (`docs/privacy-policy.html`)
- [ ] 개인정보처리방침 URL 확보 (GitHub Pages 활성화 — 사용자 작업)
- [ ] 스크린샷 준비 (1장 이상 — 사용자 작업)
- [x] 스토어 설명/상세 설명 작성 (`docs/store-listing.md`)
- [ ] ZIP 루트에 `manifest.json` 확인
- [ ] 로컬 Load unpacked로 기능 테스트 완료 (최종 QA)
- [ ] version 숫자 확인 (`0.2.0` → 출시 전 `1.0.0` 권장, 선택)

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

1. **스크린샷 캡처** → `assets/screenshots/` 폴더에 저장
2. **개인정보처리방침** → GitHub Pages로 호스팅, URL 확보
3. **스토어 설명** → Dashboard에 입력
4. **manifest version** → `1.0.0`으로 변경
5. **ZIP 패키지** → `right-click-on-web.zip` 생성
6. **Developer Dashboard** → 제출 및 승인 대기
