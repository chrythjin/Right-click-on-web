# Chrome Web Store 등록 정보 (v0.6.0 → 스토어 출시용)

> 이 문서는 Developer Dashboard 입력용 최종 복사본입니다. 각 항목을 대시보드에 그대로 붙여넣으면 됩니다.
> ZIP 패키징 시 반드시 `content-main.js`를 포함하세요 (듀얼 스크립트 아키텍처 — AGENTS.md 참조).

---

## 1. 기본 정보

| 항목 | 값 |
|------|-----|
| **이름 (Name)** | Right-click on Web |
| **버전 (Version)** | 0.6.0 (스토어 출시 전 `1.0.0` 승격 여부 결정) |
| **카테고리** | 생산성 (Productivity) |
| **언어** | 한국어 (+ 영어 manifest description) |
| **단일 목적 (Single Purpose)** | 웹페이지의 우클릭·드래그 선택·복사 차단 스크립트 완화 |

---

## 2. 짧은 설명 (Short Description, 132자 이내)

```
우클릭, 선택, 복사 방해를 일반 웹 상호작용으로 되돌립니다.
```

---

## 3. 상세 설명 (Detailed Description, HTML 허용)

```html
<h2>Right-click on Web</h2>
<p>우클릭, 텍스트 선택, 복사/잘라내기, 드래그 차단을 완화하는 크롬 확장 프로그램입니다.</p>

<h3>주요 기능</h3>
<ul>
  <li>우클릭 메뉴 복원 (contextmenu)</li>
  <li>텍스트 선택 허용 (selectstart, user-select CSS)</li>
  <li>복사/잘라내기/붙여넣기 차단 완화 (copy, cut, paste)</li>
  <li>이미지·텍스트 드래그 복원 (dragstart)</li>
  <li>마우스·터치 조작 차단 완화 (mousedown, mouseup, touch*)</li>
  <li>차단용 투명 오버레이 무력화 (pointer-events)</li>
  <li>Closed Shadow DOM 내부 차단 요소 제거 (attachShadow 패치)</li>
  <li>페이지가 차단 스크립트를 다시 추가해도 2초마다 자동 재검사</li>
  <li>팝업에서 전역·현재 사이트 ON/OFF 및 세션 임시 활성화</li>
  <li>Lite/Ultimate 완화 모드와 전체 사이트 설정 대시보드</li>
  <li>Chrome 사이드 패널에서 페이지를 보면서 도메인 관리 (v0.6.0)</li>
  <li>아이콘 우클릭 메뉴와 OS 다크/라이트 테마 자동 대응 (v0.6.0)</li>
</ul>

<h3>제한 사항</h3>
<p>모든 사이트에서 100% 동작을 보장하지 않습니다. DRM/보호 미디어(Netflix 등), 이미지/캔버스 렌더링 텍스트, 서버 측에서 텍스트를 보내지 않는 페이지, sandbox iframe 등에서는 제한될 수 있습니다.</p>

<h3>권한 안내</h3>
<p>이 확장은 모든 웹페이지에서 차단 스크립트를 완화하기 위해 호스트 권한(&lt;all_urls&gt;)을 사용합니다. 원격 서버에 데이터를 전송하거나 사용자 브라우징 데이터·입력 내용을 수집·저장하지 않습니다. 사용자가 직접 지정한 전역·도메인·모드 설정만 chrome.storage.sync에 동기화하며, 동기화 실패 시 chrome.storage.local에 현재 기기용으로 저장합니다.</p>
```

---

## 4. 권한 사유 설명 (Permission Justification)

> **host_permissions `<all_urls>` 필요 이유**: 우클릭/선택/복사 차단은 페이지의 인라인 스크립트, CSS 속성, 이벤트 리스너로 구현됩니다. 이를 완화하려면 사용자가 방문하는 모든 웹페이지에 콘텐츠 스크립트가 주입되어야 하므로 전체 호스트 권한이 필요합니다.
>
> **데이터 처리**: 원격 서버 전송 없음, 사용자 브라우징 데이터 수집 없음, 사용자 설정만 `chrome.storage.sync`에 동기화하며 동기화 실패 시 `chrome.storage.local`에 저장.

---

## 5. 데이터 사용 설문 (Data Usage / Data Practices)

모든 항목 **[수집하지 않음]** / **[아니오]**:

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
- 호스팅: GitHub Pages 활성화 필요 (repo Settings → Pages → `docs/` 루트)
- 예상 URL: `https://chrythjin.github.io/Right-click-on-web/privacy-policy.html`

---

## 7. 스크린샷

| 파일 | 규격 | 상태 |
|------|------|------|
| `assets/screenshots/popup-ui.png` | 1280×800 또는 640×400 PNG | ❌ 캡처 필요 |
| `assets/screenshots/test-page.png` | 1280×800 또는 640×400 PNG | ❌ 캡처 필요 |

캡처 방법: Load unpacked → popup 열기 (Win+Shift+S), `tests/manual/blocked-page.html` 열어 확장 ON 상태에서 캡처.

---

## 8. ZIP 패키징 명령 (content-main.js 포함 — 필수!)

```powershell
Compress-Archive -Path manifest.json,shared.js,background.js,content.js,content-main.js,popup.html,popup.css,popup.js,options.html,options.css,options.js,icons -DestinationPath "right-click-on-web.zip" -Force
```

**제외**: `.git`, `.serena`, `.omo`, `history`, `docs`, `tests`, `popup-preview.html`, `README.md`

---

## 9. 제출 전 최종 체크리스트

- [x] Manifest V3 (`manifest_version: 3`)
- [x] 권한 최소화 (`storage` + `<all_urls>` 호스트 권한)
- [x] 아이콘 (`icons/icon128.png`, `icons/icon512.png`)
- [x] 듀얼 콘텐츠 스크립트 (`content.js` + `content-main.js` — 둘 다 manifest에 선언)
- [x] 개인정보처리방침 파일 작성 (`docs/privacy-policy.html`)
- [ ] 개인정보처리방침 URL 확보 (GitHub Pages 활성화 — 사용자 작업)
- [ ] 스크린샷 1장 이상 (사용자 작업)
- [ ] ZIP 패키지 생성 + 검증
- [ ] version `1.0.0`으로 올리기 (권장, 선택)
- [ ] Developer Dashboard 등록 ($5 — 사용자 작업)
