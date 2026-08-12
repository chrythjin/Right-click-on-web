# Right-click on Web — 복사 신뢰성 강화 및 로컬 OCR 텍스트 추출 통합 계획서 (v0.7.0 & v0.8.0)

본 계획서는 **「우클릭 차단 종결자」**와 **「Text From PRO」**의 벤치마킹 분석을 종합하여,  
DOM 텍스트 차단 해제부터 이미지/동영상 텍스트 인식까지 완벽하게 지원하는  
**2단계 통합 고도화 구현 계획서**입니다.

> 2026-08-12 기준 코드 검토 결과 반영. 초안의 기술적 오류(keydown 핸들러 설계, CSP 누락, OCR 번들링 전략 미비)를 수정하여 재작성.

---

## User Review Required

> [!IMPORTANT]
> **Phase별 독립 배포 가능 여부 확인 요청**
> - Phase 1(v0.7.0)과 Phase 2(v0.8.0)는 완전히 독립적으로 릴리스 가능하도록 설계됩니다.
> - Phase 2 OCR 탑재 시 패키지 용량이 현재 ~38KB에서 **3~5MB로 증가**합니다. Chrome Web Store 25MB 제한 내이나, 이를 허용할지 결정이 필요합니다.

> [!CAUTION]
> **Phase 2 브라우저 호환성**
> - `chrome.offscreen` API는 **Chrome 116+**에서만 지원됩니다. 현재 `minimum_chrome_version: "121"`이므로 문제없습니다.
> - Firefox는 `chrome.offscreen`을 지원하지 않으므로, Phase 2 OCR 기능은 **Chrome/Edge 전용**이 됩니다. 팝업 UI에서 Firefox에서는 OCR 버튼을 숨기거나 비활성화하는 분기 처리가 필요합니다.

---

## Open Questions

> [!WARNING]
> 구현 시작 전 다음 사항 확인 요청:
> 1. **Phase 2 패키지 크기 허용 여부**: Tesseract 한/영 번들(~3MB) 포함에 동의합니까?
> 2. **OCR 진입 UI 방식**: 팝업 버튼 클릭 방식과 단축키(`Alt+Shift+S`) 방식 중 어느 것을 기본으로 할까요? (둘 다 지원 가능)
> 3. **언어 지원 범위**: 한/영 외에 다른 언어 데이터(`chi_sim`, `jpn` 등)를 기본 번들에 포함할지 여부?

---

## Proposed Changes

---

### ─────────────────────────────────────────────
### [Phase 1] 복사 신뢰성 강화 및 CSS 블록 지정 고도화 (v0.7.0)
### ─────────────────────────────────────────────

#### [MODIFY] [content.js](file:///d:/VCPRG/Right-click-on-web/content.js)

##### 변경 1. `injectSelectionStyle` — CSS 규칙 강화
현재 스타일 블록(`style.textContent = ...`)에 아래 규칙을 **추가** (기존 `user-select`/`user-drag` 규칙은 유지):

```css
/* v0.7.0 추가 — ::selection 투명화 속임수 무력화 */
*:not(input):not(textarea)::selection {
  background-color: #3390ff !important;
  color: #ffffff !important;
}
*:not(input):not(textarea)::-moz-selection {
  background-color: #3390ff !important;
  color: #ffffff !important;
}

/* v0.7.0 추가 — cursor: default로 선택 불가처럼 보이게 속이는 트릭 무력화 */
p, li, span, div, article, section, blockquote,
h1, h2, h3, h4, h5, h6, td, th, pre, code, label {
  cursor: auto !important;
}

/* v0.7.0 추가 — @media print { * { display: none } } 저장 차단 무력화 */
@media print {
  body * {
    display: revert !important;
    visibility: visible !important;
  }
}
```

> **주의**: `::selection` 의사 요소 규칙은 Shadow Root 내부에도 적용되어야 합니다.
> `injectSelectionStyle(root)` 함수가 `knownShadowRoots`를 순회하면서 동일 `<style>` 태그를 Shadow Root에도 주입하므로, CSS 텍스트만 보강하면 자동으로 Shadow DOM에도 적용됩니다. ✅

##### 변경 2. 단축키 복사 가로채기 방어 (`Ctrl+C`, `Ctrl+A`, `Ctrl+X`)

**⚠️ 초안의 설계 오류 수정**: "blockedEvents에 keydown을 단순 추가"하면 기존 `handleInterceptedEvent`의 공통 로직이 그대로 실행되어 설계 의도를 벗어납니다. `keydown`은 조합키 조건이 있는 **별도 핸들러**가 필요합니다.

구현 방식:
1. `RIGHT_CLICK_ON_WEB.blockedEvents`에 `keydown`을 **추가하지 않음** (stats 오염 방지 + 핸들러 분리).
2. `addEventInterceptors()` 내부에 `keydown` 전용 캡처 리스너를 **별도 등록**:

```js
// content.js — addEventInterceptors() 내부 (eventController.signal 공유)
document.addEventListener('keydown', (event) => {
  // 편집 가능 요소(input, textarea, contenteditable)는 면제
  if (isEditableElement(event.target)) {
    return;
  }
  // Ctrl+C / Ctrl+A / Ctrl+X / Ctrl+Insert (복사 단축키 조합)
  const isModifier = event.ctrlKey || event.metaKey;
  const keyCopy = ['c', 'a', 'x'].includes(event.key.toLowerCase());
  const keyInsertCopy = event.key === 'Insert' && event.ctrlKey; // Ctrl+Insert = Copy
  if (isModifier && (keyCopy || keyInsertCopy)) {
    // 페이지가 이 이벤트에서 preventDefault()를 호출하지 못하도록 먼저 차단.
    // 브라우저 네이티브 복사/선택은 keydown의 default action이 아닌
    // 별도 클립보드 파이프라인으로 처리되므로, stopImmediatePropagation()만으로
    // 페이지 핸들러를 차단하고 네이티브 복사는 보존됩니다.
    event.stopImmediatePropagation();
  }
}, { capture: true, passive: false, signal: eventController.signal });
```

> **설계 근거**:
> - `keydown`에서 `preventDefault()`를 호출하는 페이지 핸들러를 `stopImmediatePropagation()`으로 먼저 막습니다.
> - 브라우저의 네이티브 복사(`Ctrl+C`) 동작은 `keydown` 이벤트의 default action이 아니라 별도의 클립보드 파이프라인으로 처리되므로, `stopImmediatePropagation()`을 해도 실제 복사는 정상 동작합니다.
> - `eventController.signal`을 공유하므로 `disableUnlocker()` 호출 시 자동 제거됩니다.

---

#### [MODIFY] [popup.js](file:///d:/VCPRG/Right-click-on-web/popup.js)

`popup.js:227-231`의 `modeHint.textContent` 설정 로직 수정:

```js
// 기존
elements.modeHint.textContent = activeMode === SHARED.MODE_LITE
  ? 'Lite — 우클릭·복사 차단만 완화 (페이지 CSS 주입 없음)'
  : 'Ultimate — 우클릭·선택·복사·오버레이 모두 완화 (기본)';

// 변경 후
elements.modeHint.textContent = activeMode === SHARED.MODE_LITE
  ? 'Lite — JS 차단만 완화 (사이트 UI 보존, CSS 주입 없음)'
  : 'Ultimate — 블록 지정 활성화 (CSS 드래그 강제 허용 + 완전 복사)';
```

도메인 미설정(hasDomainEntry가 false)일 때의 힌트도 수정:
```js
// 기존
elements.modeHint.textContent = 'Lite는 우클릭·복사 차단만 완화합니다 (CSS 주입 없음). 도메인 ON 후 모드를 선택하면 저장됩니다.';

// 변경 후
elements.modeHint.textContent = 'Ultimate(기본): CSS 드래그 강제 허용. Lite: JS 차단만 완화. 도메인 ON 후 모드를 선택하세요.';
```

---

#### [MODIFY] [popup.html](file:///d:/VCPRG/Right-click-on-web/popup.html)

`mode-hint` 초기값 수정 (L48):
```html
<!-- 기존 -->
<p id="modeHint" class="mode-hint">Lite는 우클릭·복사 차단만 완화합니다 (CSS 주입 없음).</p>

<!-- 변경 후 -->
<p id="modeHint" class="mode-hint">Ultimate: 블록 지정 활성화 (CSS 드래그 강제 허용). Lite: JS 차단만 완화.</p>
```

---

#### [MODIFY] [options.html](file:///d:/VCPRG/Right-click-on-web/options.html) & [options.js](file:///d:/VCPRG/Right-click-on-web/options.js)

- 모드 컬럼 설명에 "Ultimate = 블록 지정 활성화 (CSS)" 레이블 및 툴팁 추가.
- `options.js`의 모드 렌더링 로직에서 `'ultimate'` 값을 `'블록 지정 활성화 (CSS)'`로 표시.

---

#### [MODIFY] [manifest.json](file:///d:/VCPRG/Right-click-on-web/manifest.json)

```json
// 버전 갱신만
"version": "0.7.0"
```

---

#### [MODIFY] [tests/manual/blocked-page.html](file:///d:/VCPRG/Right-click-on-web/tests/manual/blocked-page.html)

현재 12개 시나리오에 2개 추가:

**시나리오 13. `::selection` 투명화 복원 검증**
```html
<section>
  <h2>13. ::selection 투명화 속임수 무력화 (v0.7.0)</h2>
  <p class="hint">아래 영역은 <code>::selection { background: transparent; color: inherit; }</code>으로
    드래그해도 선택된 것처럼 보이지 않도록 속입니다. Ultimate 모드 ON 시 파란색(#3390ff) 하이라이트가
    표시되어야 합니다.</p>
  <style>
    #section13Target::selection { background: transparent !important; color: inherit !important; }
    #section13Target::-moz-selection { background: transparent !important; color: inherit !important; }
  </style>
  <div class="dropZone" id="section13Target">
    이 텍스트를 드래그해 보세요. 확장 OFF 시 선택 색상이 보이지 않고, 확장 Ultimate ON 시 파란색으로 표시되어야 합니다.
  </div>
</section>
```

**시나리오 14. `Ctrl+C` 단축키 가로채기 방어 검증**
```html
<section>
  <h2>14. Ctrl+C 단축키 복사 방어 (v0.7.0)</h2>
  <p class="hint">아래 버튼 클릭 후 텍스트를 선택하고 Ctrl+C를 눌러보세요.
    확장 ON 시 페이지의 keydown 핸들러가 복사를 막지 못하여 텍스트가 정상 복사됩니다.</p>
  <button id="addKeydownBlocker" type="button">Ctrl+C keydown 차단 등록</button>
  <p id="keydownStatus">상태: 미등록</p>
  <div class="dropZone" id="section14Target">
    이 텍스트를 선택하고 Ctrl+C를 눌러서 복사해 보세요. 다른 곳에 붙여넣어 내용이 복사되었는지 확인하세요.
  </div>
</section>
```

---

### ─────────────────────────────────────────────
### [Phase 2] 화면 영역 텍스트 추출 OCR 모듈 (v0.8.0)
### ─────────────────────────────────────────────

> Phase 2는 완전히 새로운 기능 모듈이며 Phase 1과 독립적으로 순차 릴리스합니다.

#### [MODIFY] [manifest.json](file:///d:/VCPRG/Right-click-on-web/manifest.json)

```json
{
  "version": "0.8.0",
  "permissions": ["storage", "activeTab", "contextMenus", "sidePanel", "offscreen"],
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
  }
}
```

> **`offscreen` 권한**: `chrome.offscreen` API 사용에 필요.  
> **`wasm-unsafe-eval` CSP**: Tesseract.js WASM 인스턴스화 시 브라우저 보안 정책 예외. MV3 필수.  
> **Firefox 호환성**: `chrome.offscreen`은 Firefox 미지원. `chrome.offscreen`이 존재하지 않는 환경에서 OCR 기능 전체 비활성화.

---

#### [NEW] `crop-overlay.js` + `crop-overlay.css`

역할: Content Script에 주입되어 화면 캡처 UI 제공.

```js
// crop-overlay.js — 간략 설계
// 1. 팝업 메시지('rcow:startCrop')를 수신하면 전체 화면 오버레이 활성화.
// 2. mousedown → mousemove → mouseup으로 사각형 선택 박스(cropRect) 추적.
// 3. mouseup 시 좌표(x, y, w, h, devicePixelRatio)를 background.js로 전달.
// 4. background.js가 captureVisibleTab 후 offscreen으로 이미지+좌표 전달.
// 5. Esc 키로 취소 가능.

// CSS: position:fixed; z-index:2147483647 의 반투명 오버레이,
//      실시간 점선 선택 박스, 십자선 커서(cursor:crosshair).
```

주의사항:
- Content Script는 ISOLATED world이므로 `document` DOM을 직접 조작 가능.
- 오버레이가 `pointer-events: none` 인 경우 마우스 이벤트를 받을 수 없으므로, 오버레이 `div`는 `pointer-events: all`로 설정.
- 오버레이 활성 중 기존 우클릭 인터셉터와 충돌하지 않도록 `eventController.signal` 기반 기존 리스너와 무관하게 별도 `AbortController` 사용.

---

#### [MODIFY] [background.js](file:///d:/VCPRG/Right-click-on-web/background.js)

```js
// background.js 추가 — OCR 브리지
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'rcow:captureAndOcr') return;
  (async () => {
    try {
      // 1. 현재 탭 화면 캡처
      const dataUrl = await chrome.tabs.captureVisibleTab(
        sender.tab.windowId,
        { format: 'png' }
      );
      // 2. Offscreen 문서 생성 (이미 있으면 재사용)
      const existingContexts = await chrome.offscreen.hasDocument?.() ??
        (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })).length > 0;
      if (!existingContexts) {
        await chrome.offscreen.createDocument({
          url: 'offscreen.html',
          reasons: ['WORKERS'],
          justification: 'Tesseract.js WASM OCR processing'
        });
      }
      // 3. Offscreen에 이미지 + 크롭 좌표 전달
      const result = await chrome.runtime.sendMessage({
        type: 'rcow:ocrRequest',
        dataUrl,
        cropRect: message.cropRect,
        devicePixelRatio: message.devicePixelRatio
      });
      sendResponse({ ok: true, text: result.text });
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true; // async sendResponse
});
```

---

#### [NEW] `offscreen.html` + `offscreen.js`

```html
<!-- offscreen.html -->
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head><body>
<canvas id="cropCanvas"></canvas>
<script src="lib/tesseract.min.js"></script>
<script src="offscreen.js"></script>
</body></html>
```

```js
// offscreen.js — 핵심 흐름
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'rcow:ocrRequest') return;
  (async () => {
    // 1. dataUrl → Image → Canvas 크롭
    const img = await loadImage(message.dataUrl);
    const { x, y, w, h, dpr } = message.cropRect;
    const canvas = document.getElementById('cropCanvas');
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, x * dpr, y * dpr, w * dpr, h * dpr, 0, 0, w * dpr, h * dpr);
    const croppedDataUrl = canvas.toDataURL('image/png');

    // 2. Tesseract.js 로컬 OCR
    const worker = await Tesseract.createWorker('kor+eng', 1, {
      workerPath: chrome.runtime.getURL('lib/tesseract.worker.min.js'),
      corePath: chrome.runtime.getURL('lib/tesseract-core.wasm.js'),
      langPath: chrome.runtime.getURL('langs/'),
      workerBlobURL: false,  // MV3 필수: blob: URL 금지
      logger: () => {}
    });
    const { data: { text } } = await worker.recognize(croppedDataUrl);
    await worker.terminate();
    sendResponse({ text: text.trim() });
  })();
  return true;
});
```

**번들 구성 (새 파일/디렉터리)**:
```
lib/
  tesseract.min.js        # Tesseract.js 코어 (~300KB)
  tesseract.worker.min.js # Tesseract 워커 스크립트 (~200KB)
  tesseract-core.wasm.js  # WASM 바이너리 래퍼 (~2MB)
langs/
  kor.traineddata.gz      # 한글 학습 데이터 (~2MB)
  eng.traineddata.gz      # 영어 학습 데이터 (~1MB)
offscreen.html
offscreen.js
```

> **총 패키지 크기 증가 예상**: ~5~6MB (현재 ~38KB → 5~6MB).  
> Chrome Web Store 25MB 제한 내이며 심사 통과 기준에는 영향 없음.

---

#### [MODIFY] [popup.html](file:///d:/VCPRG/Right-click-on-web/popup.html) & [popup.js](file:///d:/VCPRG/Right-click-on-web/popup.js)

`popup.html`에 OCR 버튼 추가 (`openOptionsButton` 위):
```html
<button id="ocrButton" class="options-link ocr-link" type="button">
  📷 화면 영역 텍스트 추출 (OCR)
</button>
```

`popup.js`에서:
- `chrome.offscreen`이 undefined이면(`isOcrSupported = typeof chrome.offscreen !== 'undefined'`) OCR 버튼 숨김 (Firefox 대응).
- 클릭 시 팝업을 닫고 content script에 `rcow:startCrop` 메시지 전송.

---

## Verification Plan

### Phase 1 — v0.7.0 수동 QA

| # | 테스트 | 기대 결과 | 합격 기준 |
|---|--------|-----------|-----------|
| 1 | 시나리오 13에서 텍스트 드래그 | 파란색(`#3390ff`) 하이라이트 표시 | 투명 선택이 보이는 색으로 복원 |
| 2 | 시나리오 14에서 `Ctrl+C` 차단 버튼 활성화 후 복사 | 텍스트 정상 복사됨 | 붙여넣기 시 원본 텍스트 확인 |
| 3 | `input`, `textarea`에서 `Ctrl+A`, `Ctrl+C` | 정상 작동 | 편집 요소 면제 확인 |
| 4 | 팝업 모드 힌트 문구 확인 | "Ultimate — 블록 지정 활성화 (CSS...)" | 경쟁 확장 사용자가 직관적으로 이해 가능 |
| 5 | Lite 모드에서 시나리오 1 영역 드래그 | `user-select: none` 유지 (선택 불가) | Lite 면제가 `::selection` 스타일에도 적용되는지 확인 |
| 6 | `@media print` — 인쇄 미리보기 | 본문 텍스트 표시됨 | `display: none` 차단 무력화 |

> **항목 5 주의**: `::selection` 규칙은 `injectSelectionStyle` 실행 시에만 주입됩니다. Lite 모드에서는 `injectSelectionStyle`이 호출되지 않으므로(`enableUnlocker` 내 조건 분기 확인), `::selection` 스타일도 Lite에서는 주입되지 않아야 합니다. 현재 코드의 `enableUnlocker` → `injectSelectionStyles` 호출이 `currentMode === SHARED.MODE_ULTIMATE` 조건 내에 있으므로 ✅.

### Phase 2 — v0.8.0 수동 QA

| # | 테스트 | 기대 결과 | 합격 기준 |
|---|--------|-----------|-----------|
| 1 | 이미지(JPG/PNG) 위 텍스트 영역 드래그 후 OCR | 클립보드에 텍스트 복사 | 붙여넣기 시 이미지 내 텍스트 확인 |
| 2 | Canvas 렌더링 텍스트(구글 닥스, Figma 등) 영역 | 텍스트 추출 | 정확도 ≥ 80% |
| 3 | 오프라인 환경(네트워크 차단)에서 OCR | 정상 동작 | 완전 로컬 실행 확인 |
| 4 | Firefox에서 OCR 버튼 | 버튼이 숨겨짐 | 오류 없이 조용히 비활성 |
| 5 | Esc 키로 캡처 취소 | 오버레이 제거, 원 상태 복원 | 페이지 인터랙션 정상 복귀 |

---

## AGENTS.md 업데이트 필요 항목

- v0.7.0 `keydown` 별도 핸들러 설계 이유 및 `editableElement` 면제 방식.
- Phase 2 파일 구성(`lib/`, `langs/`, `offscreen.*`) 항목 추가.
- `offscreen` 권한 및 `wasm-unsafe-eval` CSP 추가 이유.
- Phase 2 Firefox 비호환 범위 명시.
