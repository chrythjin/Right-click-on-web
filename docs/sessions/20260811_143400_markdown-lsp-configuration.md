# Markdown LSP 설정

## 변경 사항

- OpenCode 사용자 전역 LSP 설정에 Markdown 서버 연결을 추가했다.
- 이 저장소의 `.opencode/lsp.json`에도 같은 연결을 명시했다.
- 프로젝트에 이미 있던 TypeScript 및 JSON LSP 설정은 보존했다.
- `.md`와 `.markdown` 확장자를 Markdown 서버에 연결했다.

## 적용 범위

- 사용자 전역 설정은 다른 OpenCode 저장소에서도 Markdown LSP를 사용할 수 있게 한다.
- 프로젝트 설정은 이 저장소에서 Markdown LSP 사용을 명시적으로 보장한다.

## 검증

- 사용자 전역 설정과 프로젝트 설정 모두 JSON 파싱에 성공했다.
- OpenCode LSP 상태에서 `marksman`이 설치된 사용자 서버로 인식됐다.
- `docs/bypass-runtime-investigation.md`에 대한 LSP 진단이 서버 미구성 오류 없이 완료됐다.
- 해당 문서에서 진단 항목은 발견되지 않았다.

## 기록 범위

이 문서는 OpenCode 연결 설정과 동작 검증만 기록한다.
