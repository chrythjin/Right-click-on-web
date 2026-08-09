# 전체 사이트 설정 대시보드 및 브라우저 호환성 정리

**날짜**: 2026-08-09 06:30 (KST)  
**범위**: 경쟁 확장과의 사용자 제어 범위 동등화, Chrome/Firefox 설정 화면 계약 정리  
**상태**: 구현 및 브라우저 엔진 검증 완료

## 목표

현재 탭만 다루는 팝업의 한계를 보완해, 사용자가 저장해 둔 모든 도메인 설정을 한 화면에서 관리할 수 있도록 합니다. 기존 `shared.js`의 sync-first 저장, local quota fallback, Lite/Ultimate 스키마를 그대로 사용해 별도의 설정 저장 경로를 만들지 않습니다.

## 구현

- `options.html`/`options.css`/`options.js`를 추가했습니다.
  - 전역 차단 완화 ON/OFF
  - 저장 도메인 이름순 목록
  - 도메인별 ON/OFF, Lite/Ultimate 선택, 설정 삭제
  - Chrome Sync 사용량과 local fallback 상태
  - 설정이 없는 경우의 안내 상태
- `manifest.json`에 표준 Manifest V3 `options_ui`를 선언했습니다. Chrome은 옵션을 탭으로 열고, Firefox도 같은 `options.html`을 옵션 UI로 사용합니다.
- `browser_specific_settings.gecko`에 Firefox 배포용 식별자와 최소 Firefox 128 버전을 선언했습니다.
- 팝업에 "전체 사이트 설정 관리" 버튼을 추가하고 `chrome.runtime.openOptionsPage()`로 연결했습니다.
- 대시보드의 저장 작업은 중복 클릭을 막고 저장이 끝난 직후 재읽기합니다. `chrome.storage.onChanged`도 구독하므로 다른 기기 또는 다른 확장 화면에서 온 sync 변경이 즉시 반영됩니다.
- 연속 모드·상태 클릭은 쓰기 큐에서 실행 시점의 최신 저장 값을 기준으로 계산하므로, 빠른 클릭이 앞선 도메인 값을 덮어쓰지 않습니다.
- 개인정보처리방침, 배포 매뉴얼, 스토어 등록 문구, 패키징 목록을 실제 저장 형식과 새 파일 목록에 맞췄습니다.

## 검증

- `options.js` JavaScript 구문 검사와 변경 파일 진단을 통과했습니다.
- 실제 브라우저 엔진에서 `options.html`을 열고 Chrome storage API를 주입한 사용자 경로를 확인했습니다.
  - Ultimate 도메인을 Lite로 변경하면 sync 저장소 값이 즉시 `lite`가 됨
  - OFF 도메인 ON 전환이 저장소와 행 레이블에 즉시 반영됨
  - 설정 삭제 후 행 수가 즉시 줄어듦
  - 전역 ON/OFF가 저장소와 상태 카드에 즉시 반영됨
  - 외부 sync 변경으로 새 도메인 행이 생성되고, 빈 목록 변경으로 안내 상태가 렌더링됨
- 연속 Ultimate → Lite → ON → OFF 클릭 후 최종 `{ enabled: false, mode: 'lite' }` 값과 OFF 행 레이블이 일치함
- `options.html`, `popup.html`, 수동 QA 페이지, 개인정보처리방침의 HTML 태그 균형을 확인했습니다.
- Manifest V3 파일 참조와 패키징 문서의 새 옵션 파일 포함 여부를 확인했습니다.

## 남은 수동 확인

이 환경은 unpacked 확장 자동 로드를 제한하는 Chrome 프로필 정책이 있으므로, 실제 Chrome/Firefox 프로필에서는 한 번씩 확장을 압축 해제 로드한 뒤 팝업의 관리 버튼과 옵션 탭 표시를 직접 확인해야 합니다. 이는 코드 경로가 아닌 로컬 브라우저 정책 제약입니다.
