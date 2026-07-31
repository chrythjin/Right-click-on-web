# 20260731_235000_store-submission-flow.md — Dashboard 제출 진행 세션

## 작업 흐름

AGENTS.md 갱신 + 스토어 제출 준비(`store-submission-prep`) 커밋(`9bfbcb1`) 이후, 실제 Chrome Web Store Dashboard에서 사용자 작업 진행. 자동화 가능한 부분만 보조.

## 자동화 처리 내역

### 1. 스크린샷 크롭
- 원본: `tests/manual/screenshot.png` (1282×806, 76,881 bytes, PNG 유효)
- 분석: look_at로 내용 검증 → "Manual blocked page" QA 테스트 페이지, 스토어용으로 적절
- 처리: System.Drawing으로 center crop 1282×806 → 1280×800
- 결과: `assets/screenshots/test-page.png` (76,631 bytes, 정확 1280×800 PNG)

### 2. 커밋 + 푸시 (`6239ff8`)
- `assets/screenshots/test-page.png` (스토어용)
- `docs/.nojekyll` (Pages 비-Jekyll 처리 보장)
- `tests/manual/screenshot.png` (원본 백업용)
- 푸시 검증: 9bfbcb1..6239ff8, origin/main 동기화 완료

### 3. Pages URL 검증
- 1st poll (5s): 200 OK, "개인정보처리방침" 내용 매치
- Dashboard의 "링크 연결 불가" 오류는 빌드 전파 타이밍 이슈였음 → 안정화 후 통과

## 사용자 직접 처리 내역 (가이드 제공)

### Dashboard 등록정보 + Privacy practices 입력
- 12개 검증 오류 → 5개 → 1개 → 0개로 단계적 해결
- 모든 text fields에 copy-paste 제공
- 권한 사유, 단일 목적, 데이터 인증 체크박스, 데이터 카테고리 9개 다 "아니오"
- 최종 1개 = "개인정보처리방침 링크 연결 불가" (Pages 비활성 상태였음)

### GitHub Pages 활성화 (Settings → Pages)
- 직접 활성화: Deploy from branch / main / `/docs`
- 첫 polling (5s): URL 200, 콘텐츠 정상

## 제출 상태
- "게시할 수 없음" 오류 0개 → 제출 가능
- "게시가 지연됩니다 — 광범위 호스트 권한" 경고 1개 (정보성, 수정 의무 없음)
- 권장: 그대로 두고 "제출하여 검토받기" 클릭 (사용자 진행)
- 심사 예상: 2~5일 (광범위 호스트 권한 사유로 인해 지연 가능)

## 수정/발견된 부수적 사항
- 기존 3개 배포 문서 ZIP 명령에 `content-main.js` 누락 — `9bfbcb1`에서 수정 완료
- manifest 최상위 `icons` 키 없음 — `9bfbcb1`에서 추가 (스토어 목록 아이콘용으로 필수)
- 리포 비공개라 Pages 무료 안 됐음 → 사용자 결정으로 리포 공개 (Settings → Danger Zone)
- `.cortexkit/`, `.codegraph/` 툴 산출물 → `.gitignore`에 추가

## 다음 단계 (사후 모니터링)
1. 2~5일 내 이메일로 심사 결과 수신 (승인/거절/추가 정보)
2. 승인 시 자동 게시, 별도 URL은 `support URL`로 사용자에게 노출
3. 거절 시 사유 보고 후 수정·재제출
4. 1주일 무응답 시 GitHub Actions/보내는 메일함 확인으로 폴로업

## 현재 상태 요약
- 커밋: `6239ff8` (main)
- 리포: public
- Pages: live at `https://chrythjin.github.io/Right-click-on-web/`
- ZIP: `right-click-on-web.zip` 11.7 KB, 로컬
- 스크린샷: `assets/screenshots/test-page.png` 1280×800
- 개인정보처리방침 URL: 정상 응답
- Dashboard: 제출 단계 진입, 사용자 클릭 대기
