# Chrome Web Store 개인정보 보호 관행 — 권한 사용 목적

**날짜:** 2026-08-10 18:39:34  
**상황:** CWS 상품 게시 시 `activeTab`, `contextMenus`, `sidePanel` 권한에 대한 사용 목적 입력이 필요하여 거부됨.  
**해결 방식:** 코드 변경 없이 개발자 콘솔 "개인 정보 보호 관행" 탭에 아래 문구를 입력 후 임시저장.

---

## activeTab

> 확장 프로그램의 팝업(popup.html)이 사용자가 현재 보고 있는 탭의 URL을 읽어 도메인별 설정을 표시하고 적용할 수 있도록 필요합니다. `chrome.tabs.query({active: true, currentWindow: true})`와 `URL` 파싱만 사용하며, 페이지 콘텐츠나 개인 정보를 외부로 전송하지 않습니다.

코드 근거: `popup.js:61-71 getCurrentHostname()`

---

## contextMenus

> 브라우저 액션 아이콘을 마우스 오른쪽 버튼(또는 길게 누름)으로 클릭했을 때 "전역 차단 완화 켜기/끄기", "사이트 패널에서 열기", "전체 사이트 설정 관리" 메뉴를 표시하기 위해 필요합니다. 메뉴는 확장 아이콘(`contexts: ['action']`)에만 등록되며 웹사이트 콘텐츠 메뉴에는 표시되지 않습니다.

코드 근거: `background.js:182-204 registerContextMenus()`, manifest `permissions: [..., "contextMenus"]`

---

## sidePanel

> 사용자가 확장 아이콘의 컨텍스트 메뉴 또는 팝업의 "사이트 패널에서 열기" 버튼으로 옵션 대시보드(`options.html`)를 Chrome 사이드 패널 형태로 열 수 있도록 필요합니다. 브라우저가 `sidePanel` API를 지원하지 않으면 일반 옵션 페이지로 대체됩니다.

코드 근거: `background.js:218-229`, `popup.js:348-363`, manifest `side_panel.default_path: "options.html"`

---

## 요약 한 줄

해당 권한들은 모두 확장의 UI(팝업/옵션/컨텍스트 메뉴/사이드 패널)와 사용자 설정을 동기화하는 데만 사용되며, 사용자 데이터를 수집하거나 외부 서버로 전송하지 않습니다.

---

## 메모

- 이번 문제는 **코드 수정 없이** CWS 폼 입력만으로 해결되는 절차적 거부 사유였음.
- manifest `permissions`에는 `"storage"`, `"activeTab"`, `"contextMenus"`, `"sidePanel"`이 선언되어 있으며, 각각의 실제 사용처는 위와 같음.
- 동일한 권한 설명이 추후 갱신 제출(re-review) 시 재사용될 수 있음.
