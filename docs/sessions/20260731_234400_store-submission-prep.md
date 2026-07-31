# 20260731_234400_store-submission-prep.md — 스토어 제출 준비 세션

## 작업 내용

사용자가 "이 익스텐션이 배포 준비가 된 상태야?" 질문 → 배포 준비 상태를 직접 검증하고, 자동화 가능한 준비 작업을 수행.

## 판정 (검증 기반)

### 코드 측 — 준비 완료 ✅
- MV3, 듀얼 콘텐츠 스크립트 (ISOLATED content.js + MAIN content-main.js, `world: "MAIN"`)
- 권한 최소화: `storage` + `<all_urls>` 호스트 권한
- 아이콘: icon128.png (128×128, 유효 PNG), icon512.png (512×512, 유효 PNG)
- `minimum_chrome_version: 111`
- 수동 QA 하네스: `tests/manual/blocked-page.html` (8 시나리오)
- manifest JSON 유효, ZIP 내부 참조 일관성 확인

### 스토어 측 — 70% 🔄 (사용자 작업 남음)
| 작업 | 상태 |
|------|------|
| 스토어 설명 | ✅ `docs/store-listing.md` |
| 개인정보처리방침 파일 | ✅ `docs/privacy-policy.html` |
| 개인정보처리방침 URL 호스팅 | ⬜ GitHub Pages 활성화 (사용자) |
| 스크린샷 | ⬜ 사용자 캡처 필요 |
| ZIP 패키지 | ✅ `right-click-on-web.zip` (11.7KB, 9파일) |
| version 1.0.0 | ⬜ 출시 직전 결정 (현재 0.2.0) |
| 개발자 계정 ($5) + 제출 | ⬜ 사용자 |

## 발견된 결함 및 수정
1. **배포 문서 ZIP 명령이 `content-main.js` 누락** (3개 문서) — 이대로 패키징하면 MAIN world 패치가 없는 깨진 확장 배포 위험 → 전부 수정
2. **manifest에 최상위 `icons` 키 없음** — 스토어 목록 아이콘용으로 필수 → 추가 (128/512)
3. `.cortexkit/`, `.codegraph/`가 .gitignore에 없음 → 추가

## 검증 내역
- PNG 시그니처: 89 50 4E 47 0D 0A 1A 0A (유효) × 2
- 이미지 크기: 128×128, 512×512
- ZIP: 루트에 manifest.json, content-main.js 포함, 9개 파일
- manifest JSON 파싱 성공, content_scripts 2개 선언 확인

## 커밋 상태
- 변경 파일: `.gitignore`, `manifest.json`, `docs/` 3개, 신규 `docs/privacy-policy.html`, `docs/store-listing.md`, `right-click-on-web.zip`
- 아직 커밋/푸시 안 됨 (사용자 지시 대기)
- 백업: `history/file-backups/`에 base+delta 4건 (docs 3 + manifest 1)
