# 무빌드 검증 스크립트 추가

## 변경 사항

- `scripts/verify.ps1`을 추가해 제품 JavaScript의 `node --check`, Manifest V3 JSON 파싱, MAIN-first content script 순서, 로컬 OCR 자산, offscreen 로컬 script 순서와 `git diff --check`를 한 명령으로 검사한다.
- `-RootPath` 선택 인자로 임시 fixture를 같은 검증 경로에 넣을 수 있다.

## 검증 기록

- `pwsh -NoProfile -File .\scripts\verify.ps1`: 모든 검사 통과.
- 임시 manifest 순서 fixture: `FAIL manifest has MAIN-first content scripts`, 종료 코드 `1` 확인.
- fixture 정리 영수증: 임시 디렉터리 삭제 완료.
- 기존 LF/CRLF 변환 경고는 기록만 하고 파일을 수정하지 않았다.

## 2026-08-13 20:30 보완

- `-SkipGitDiffCheck`를 명시적 fixture 전용 mode로 추가했다. 기본값은 false이므로 일반 `-RootPath` 실행과 실제 worktree 실행은 계속 `git diff --check`를 수행한다.
- MAIN-first 순서 fixture는 `-SkipGitDiffCheck`를 사용해 목표 검사만 실패시키며, Git worktree가 아닌 임시 경로의 부수 오류를 제거한다.
