# 벤치마킹 분석 & 기능 향상 로드맵

**작성일:** 2026-08-08  
**기준 버전:** Right-click on Web v0.2.0  
**벤치마킹 대상:** 우클릭 차단 종결자 (Ultimate Enable Right Click)  
**대상 URL:**
- 랜딩 페이지: https://ultimate-enable-right-click.github.io/
- Chrome 웹스토어: https://chromewebstore.google.com/detail/emfeppdfcjnldjgmofdkbggeacapegen

> **v0.10.0 문서 정합성 메모 (2026-08-15):** 이미지 OCR, 선택형 로컬 OCR 기록, 마지막 영역 반복의 자동 구현·검증은 완료되었다. 화면 픽셀은 로컬 OCR 처리 중 메모리에만 일시적으로 존재하며 저장·전송하지 않는다. OCR 기록은 기본 OFF이고 opt-in 시 최종 텍스트와 제한 메타데이터만 `chrome.storage.local`에 최대 20개·30일·64 KiB로 저장하며 동기화하지 않는다. 마지막 영역 반복은 `chrome.storage.session`의 제한된 geometry/context metadata만 사용하고, 조건을 검증한 뒤 새 화면을 캡처한다. 실제 unpacked Chrome 수동 QA는 별도 배포 게이트로 남는다.

---

## 1. 경쟁 확장 프로그램 분석

### 1.1 확장 프로그램 개요

| 항목 | 우클릭 차단 종결자 |
| :--- | :--- |
| **이름** | 우클릭 차단 종결자 (Ultimate Enable Right Click) |
| **지원 브라우저** | Chrome, Edge, Firefox, Naver Whale |
| **Manifest** | MV3 |
| **권한** | `activeTab`, `storage`, `scripting` |
| **핵심 철학** | "우클릭 해제"가 아닌 **"우클릭 차단 방지"** — 페이지가 차단을 설치하기 전에 원천적으로 불가능하게 만듦 |

### 1.2 경쟁 확장 프로그램 주요 기능

#### A. 원천 차단 방지 (Preventive Approach)
- 이미 등록된 이벤트 리스너를 제거하는 방식이 아닌, **페이지 로딩 시점에 JS 이벤트 등록 자체를 무력화**하는 프로토타입 패치 방식 사용.
- 타 확장이 해제하지 못하는 사이트에서도 우클릭이 정상 동작하도록 원천 차단.

#### B. 도메인별(Per-domain) 설정 관리
- 사이트별(도메인별) ON/OFF 토글 제공.
- 팝업 UI에서 현재 사이트의 활성 여부를 즉시 확인 및 변경 가능.
- `chrome.storage.sync`를 통한 크롬 계정 동기화 지원 — 다른 PC에서도 설정이 유지됨.

#### C. 세션 임시 실행 ("Run in this session")
- 영구 설정 변경 없이 현재 세션에서만 일시적으로 차단 해제 활성화.
- 브라우저 종료 또는 탭 닫기 시 자동 해제.

#### D. CSS 기반 차단 해제 모듈
- JS 기반 차단 외에, **CSS로 `user-select: none`을 걸어 텍스트 선택을 막는 사이트**에 대한 별도 모듈.
- "텍스트 선택 허용 (CSS)" 토글로 사용자가 선택적으로 활성화.

#### E. 붙여넣기(Paste) 차단 방지
- 은행/보험 사이트 등에서 비밀번호 입력란에 붙여넣기를 차단하는 것을 무력화.

#### F. 사이트 부작용 최소화
- 정교한 기술 적용으로 웹사이트 정상 동작에 미치는 영향 최소화.
- 항상 켜 놓아도 다른 사이트가 깨지지 않는 것을 목표.

---

## 2. 현재 Right-click on Web v0.2.0 기술 비교

### 2.1 기능 비교 매트릭스

| 기능 | Right-click on Web v0.2.0 | 우클릭 차단 종결자 | 갭 분석 |
| :--- | :---: | :---: | :--- |
| **MAIN world 프로토타입 패치** | ✅ `addEventListener` + `attachShadow` | ✅ `addEventListener` 중심 | **동등 또는 우위** — Shadow DOM 패치까지 포함 |
| **Closed Shadow DOM → Open 전환** | ✅ `attachShadow` 패치로 closed→open | △ 부분 대응 | **우위** |
| **IDL 속성 락 해제** | ✅ `Object.defineProperty` 재정의 | △ 표준 이벤트 무력화 | **우위** |
| **캡처 페이즈 이벤트 인터셉터** | ✅ 13개 이벤트, AbortController 기반 | ✅ | 동등 |
| **MutationObserver + Periodic Rescan** | ✅ 2초 간격, idle-deferred, 탭 숨김 시 정지 | ✅ | 동등 |
| **오버레이 무력화** | ✅ empty absolute/fixed → pointer-events:none | ✅ | 동등 |
| **입력 필드 보호** | ✅ `isEditableElement()` 예외 처리 | ✅ | 동등 |
| **CSS `user-select` 강제 해제** | ✅ 항상 주입 (Lite/Ultimate 구분 없음) | ✅ 별도 토글 | **갭 — 모드 분리 필요** |
| **도메인별 ON/OFF 제어** | ❌ 전역 ON/OFF만 | ✅ 도메인별 + 동기화 | **주요 갭** |
| **세션 임시 실행** | ❌ | ✅ "Run in this session" | **주요 갭** |
| **Chrome sync 설정 동기화** | ❌ `chrome.storage.local`만 사용 | ✅ `chrome.storage.sync` | **갭** |
| **2단계 모드 (Lite/Ultimate)** | ❌ 단일 모드 | ✅ 기본 + CSS 강력 모드 | **갭** |
| **QA 통계** | ✅ `window.__rightClickOnWebStats` | ❌ | **우위** |

### 2.2 기술적 우위 사항 (유지할 강점)

1. **이중 스크립트 아키텍처 (ISOLATED + MAIN world)**
   - `content-main.js`가 `document_start`에서 `addEventListener` + `attachShadow` 프로토타입 패치를 선제 적용.
   - `content.js`가 ISOLATED world에서 DOM 클린업, 캡처 페이즈 인터셉터, MutationObserver, Periodic Rescan 수행.
   - 경쟁자 대비 아키텍처적으로 더 견고한 분리 구조.

2. **Closed Shadow DOM 완전 대응**
   - `patchedAttachShadow`가 `Object.create(init)` + `mode:'open'` 오버라이드로 closed shadow root를 open으로 변환.
   - 경쟁자가 일부만 대응하는 것 대비 우위.

3. **IDL 속성 락 해제 (`clearLockedIdlAttribute`)**
   - `Object.defineProperty(el, 'oncontextmenu', {configurable:false})`로 락이 걸린 속성을 강제 재정의.
   - 경쟁자에서 확인되지 않는 고급 기술.

4. **런타임 QA 통계**
   - `window.__rightClickOnWebStats`로 attribute removals, event interceptions, overlays, shadow roots 통계 실시간 노출.

---

## 3. 구현 로드맵 (4개 핵심 기능)

### 3.1 Phase 1: 도메인별(Per-domain) ON/OFF 제어

> **우선순위: 🔴 높음**  
> **목표 버전: v0.3.0**  
> **예상 변경 파일:** `manifest.json`, `background.js`, `popup.html`, `popup.css`, `popup.js`, `content.js`

#### 3.1.1 개요
특정 사이트(Figma, Google Docs, Notion 등)에서 자체 우클릭/컨텍스트 메뉴 기능을 사용해야 할 때, 해당 도메인만 예외 처리하는 기능.

#### 3.1.2 데이터 스키마
```json
{
  "enabled": true,
  "domainSettings": {
    "figma.com": false,
    "docs.google.com": false,
    "github.com": true
  }
}
```

- **`enabled`**: 전역 ON/OFF (기존 유지)
- **`domainSettings`**: 도메인별 활성화 맵. 키가 없으면 전역 설정을 따름. 명시적 `false`이면 해당 도메인에서 비활성화.

#### 3.1.3 manifest.json 변경
```diff
- "permissions": ["storage"],
+ "permissions": ["storage", "activeTab"],
```
- `activeTab` 권한 추가: 팝업에서 현재 활성 탭의 URL을 조회하기 위해 필요.

#### 3.1.4 background.js 변경
```javascript
const DEFAULT_SETTINGS = {
  enabled: true,
  domainSettings: {}
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
    chrome.storage.local.set({
      enabled: settings.enabled !== false,
      domainSettings: settings.domainSettings || {}
    });
  });
});
```

#### 3.1.5 popup.js 변경
```javascript
// 현재 활성 탭의 hostname 획득
async function getCurrentHostname() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return null;
  try {
    return new URL(tab.url).hostname;
  } catch {
    return null;
  }
}

// 도메인별 활성 상태 판정
function isDomainEnabled(globalEnabled, domainSettings, hostname) {
  if (!globalEnabled) return false;
  if (hostname && hostname in domainSettings) {
    return domainSettings[hostname];
  }
  return globalEnabled;
}

// 도메인 토글 핸들러
async function toggleDomain(hostname) {
  const settings = await chrome.storage.local.get(STORAGE_DEFAULTS);
  const ds = settings.domainSettings || {};
  const currentlyEnabled = isDomainEnabled(settings.enabled, ds, hostname);
  ds[hostname] = !currentlyEnabled;
  await chrome.storage.local.set({ domainSettings: ds });
}
```

#### 3.1.6 popup.html UI 추가
```html
<!-- 기존 status-card 아래에 추가 -->
<section class="domain-card" aria-live="polite">
  <div>
    <p class="label">현재 사이트</p>
    <p id="domainText" class="domain-text">확인 중...</p>
  </div>
  <button id="domainToggle" class="toggle-button toggle-small" type="button" aria-pressed="true">
    ON
  </button>
</section>
```

#### 3.1.7 content.js 변경
```javascript
// 기존 전역 ON/OFF 로직에 도메인 판정 추가
function getHostname() {
  try { return new URL(window.location.href).hostname; } 
  catch { return ''; }
}

chrome.storage.local.get({ enabled: true, domainSettings: {} }, (settings) => {
  const hostname = getHostname();
  const domainSetting = settings.domainSettings?.[hostname];
  // 도메인 설정이 명시적 false이면 비활성화
  if (domainSetting === false) {
    setEnabled(false);
  } else {
    setEnabled(settings.enabled !== false);
  }
});

// storage.onChanged에서도 domainSettings 변경 감지
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  const hostname = getHostname();
  
  if (changes.domainSettings) {
    const ds = changes.domainSettings.newValue || {};
    if (hostname in ds) {
      setEnabled(ds[hostname] !== false);
      return;
    }
  }
  
  if (changes.enabled) {
    // 도메인 설정이 없을 때만 전역 설정 적용
    chrome.storage.local.get({ domainSettings: {} }, (settings) => {
      if (!(hostname in (settings.domainSettings || {}))) {
        setEnabled(changes.enabled.newValue !== false);
      }
    });
  }
});
```

#### 3.1.8 popup.css 추가 스타일
```css
.domain-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-left: 3px solid var(--gold);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
}

.domain-text {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--muted);
  word-break: break-all;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toggle-small {
  min-width: 56px;
  min-height: 34px;
  font-size: 12px;
}
```

---

### 3.2 Phase 2: 세션 임시 실행 ("Run in this session")

> **우선순위: 🟡 중간**  
> **목표 버전: v0.3.0 (Phase 1과 동시)**  
> **예상 변경 파일:** `popup.html`, `popup.css`, `popup.js`, `content.js`, `background.js`

#### 3.2.1 개요
도메인 설정을 영구적으로 저장하지 않고, 현재 브라우저 세션(또는 탭 생존 기간) 동안만 차단 해제를 일시 활성화하는 기능.

#### 3.2.2 저장소 설계
MV3의 `chrome.storage.session` API 사용:
```javascript
// 세션 스토리지에 도메인별 임시 활성화 기록
// 브라우저 종료 시 자동 삭제됨
chrome.storage.session.set({ 
  [`session_${hostname}`]: true 
});
```

> **`chrome.storage.session` 특징:**
> - Service Worker 재시작에도 유지됨 (MV3).
> - 브라우저 완전 종료 시에만 소멸.
> - `storage` 권한만으로 사용 가능 (추가 권한 불필요).

#### 3.2.3 우선순위 판정 로직
```
세션 임시 활성화 (session_${hostname})
  → 있으면 무조건 활성화 (영구 설정 무시)
  
도메인 설정 (domainSettings[hostname])
  → 명시적 false이면 비활성화
  → 명시적 true이면 활성화
  
전역 설정 (enabled)
  → 도메인 설정이 없을 때 사용
```

#### 3.2.4 content.js 판정 통합
```javascript
async function resolveEnabled() {
  const hostname = getHostname();
  
  // 1순위: 세션 임시 활성화
  const sessionKey = `session_${hostname}`;
  const sessionData = await chrome.storage.session.get(sessionKey);
  if (sessionData[sessionKey] === true) {
    return true;
  }
  
  // 2순위: 도메인별 설정
  const settings = await chrome.storage.local.get({ enabled: true, domainSettings: {} });
  if (hostname in settings.domainSettings) {
    return settings.domainSettings[hostname] !== false;
  }
  
  // 3순위: 전역 설정
  return settings.enabled !== false;
}
```

#### 3.2.5 popup.html UI 추가
```html
<!-- domain-card 아래에 추가 -->
<button id="sessionButton" class="session-button" type="button">
  이번 세션만 임시 활성화
</button>
```

#### 3.2.6 popup.css 추가 스타일
```css
.session-button {
  display: block;
  width: 100%;
  margin-top: 10px;
  padding: 10px 14px;
  border: 1px dashed rgba(200, 164, 93, 0.4);
  border-radius: 12px;
  background: transparent;
  color: var(--gold);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background 180ms ease, border-color 180ms ease;
}

.session-button:hover {
  background: rgba(200, 164, 93, 0.1);
  border-color: var(--gold);
}

.session-button.is-active {
  background: rgba(200, 164, 93, 0.15);
  border-style: solid;
  border-color: var(--gold);
}

.session-button.is-active::after {
  content: ' ✓';
}
```

---

### 3.3 Phase 3: chrome.storage.sync 도입

> **우선순위: 🟡 중간**  
> **목표 버전: v0.4.0**  
> **예상 변경 파일:** `background.js`, `popup.js`, `content.js`

#### 3.3.1 개요
기존 `chrome.storage.local` → `chrome.storage.sync`로 마이그레이션하여, 사용자가 동일 크롬 계정으로 로그인한 다른 PC에서도 도메인별 설정이 자동 동기화되도록 함.

#### 3.3.2 마이그레이션 전략

> [!IMPORTANT]
> `chrome.storage.sync`는 **총 용량 제한** (102,400 바이트), **항목당 8,192 바이트**, **항목 수 512개**의 제한이 있음. 도메인 설정이 많아지면 청크 분할 또는 압축이 필요할 수 있음.

```javascript
// background.js — 설치/업데이트 시 마이그레이션
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'update') {
    // local → sync 마이그레이션
    const localData = await chrome.storage.local.get(null);
    if (localData.enabled !== undefined || localData.domainSettings) {
      await chrome.storage.sync.set({
        enabled: localData.enabled ?? true,
        domainSettings: localData.domainSettings ?? {}
      });
      // 마이그레이션 완료 후 local 정리 (선택)
      // await chrome.storage.local.remove(['enabled', 'domainSettings']);
    }
  } else {
    // 신규 설치
    await chrome.storage.sync.set({
      enabled: true,
      domainSettings: {}
    });
  }
});
```

#### 3.3.3 3개 파일 일괄 교체 패턴
| 파일 | 변경 내용 |
| :--- | :--- |
| `background.js` | `chrome.storage.local` → `chrome.storage.sync` |
| `popup.js` | `chrome.storage.local.get/set` → `chrome.storage.sync.get/set`, `onChanged` areaName `'local'` → `'sync'` |
| `content.js` | `chrome.storage.local.get` → `chrome.storage.sync.get`, `onChanged` areaName `'local'` → `'sync'` |

#### 3.3.4 세션 스토리지와의 관계
- `chrome.storage.session`은 **동기화 대상이 아님** (의도대로 — 임시 설정은 현재 기기에서만 유효).
- 영구 설정(`enabled`, `domainSettings`)만 sync 대상.
- 세션 임시 실행은 그대로 `chrome.storage.session` 유지.

---

### 3.4 Phase 4: 2단계 동작 모드 (Lite / Ultimate)

> **우선순위: 🟢 낮음**  
> **목표 버전: v0.5.0**  
> **예상 변경 파일:** `content.js`, `popup.html`, `popup.css`, `popup.js`

#### 3.4.1 개요
현재 v0.2.0은 CSS 스타일 주입(`user-select: text !important`)과 JS 이벤트 차단을 동시에 수행하여, 일부 사이트에서 레이아웃이 깨지거나 드래그 앤 드롭 기능이 오작동할 수 있음. 이를 2단계로 분리.

#### 3.4.2 모드 정의

| | Lite Mode (기본) | Ultimate Mode (강력) |
| :--- | :--- | :--- |
| **MAIN world 패치** | ✅ `addEventListener` + `attachShadow` | ✅ 동일 |
| **캡처 페이즈 인터셉터** | ✅ | ✅ |
| **CSS `user-select` 주입** | ❌ 비활성화 | ✅ 활성화 |
| **오버레이 `pointer-events:none`** | ❌ 비활성화 | ✅ 활성화 |
| **인라인 속성 제거** | ✅ `oncontextmenu` 등 제거 | ✅ 동일 |
| **`-webkit-user-drag` 강제** | ❌ | ✅ |
| **사용 시나리오** | 일반 사이트 (부작용 최소화) | 강력한 차단 사이트 (네이버 블로그, 학술 사이트 등) |

#### 3.4.3 데이터 스키마 확장
```json
{
  "enabled": true,
  "mode": "lite",
  "domainSettings": {
    "example.com": { "enabled": true, "mode": "ultimate" }
  }
}
```
- **`mode`**: `"lite"` (기본) 또는 `"ultimate"`. 전역 기본값.
- **`domainSettings`**: 기존 boolean 값을 객체로 확장하여 도메인별 모드도 지정 가능.

#### 3.4.4 content.js 모드 분기
```javascript
function enableUnlocker(mode = 'lite') {
  if (isActive) return;

  resetStats();
  removeBlockingAttributes();      // 두 모드 모두 실행
  addEventInterceptors();          // 두 모드 모두 실행
  observeBlockingChanges();        // 두 모드 모두 실행
  startPeriodicRescan();           // 두 모드 모두 실행

  if (mode === 'ultimate') {
    injectSelectionStyle();        // Ultimate에서만 CSS 주입
  }

  isActive = true;
  currentMode = mode;
}
```

#### 3.4.5 popup.html UI 추가
```html
<!-- status-card 내부 또는 아래에 -->
<section class="mode-card">
  <p class="label">동작 모드</p>
  <div class="mode-buttons">
    <button id="modeLite" class="mode-btn is-selected" type="button">
      Lite
    </button>
    <button id="modeUltimate" class="mode-btn" type="button">
      Ultimate
    </button>
  </div>
</section>
```

#### 3.4.6 popup.css 추가 스타일
```css
.mode-card {
  margin-top: 10px;
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
}

.mode-buttons {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.mode-btn {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 180ms ease;
}

.mode-btn:hover {
  background: rgba(255, 255, 255, 0.06);
}

.mode-btn.is-selected {
  background: linear-gradient(135deg, var(--rosso-corsa), var(--deep-red));
  color: var(--text);
  border-color: var(--rosso-corsa);
  box-shadow: 0 4px 12px rgba(225, 6, 0, 0.3);
}
```

---

## 4. 구현 일정 요약

```
v0.3.0  ─── Phase 1: 도메인별 ON/OFF 제어 [🔴 높음]
        ├── Phase 2: 세션 임시 실행      [🟡 중간]
        │
v0.4.0  ─── Phase 3: chrome.storage.sync [🟡 중간]
        │
v0.5.0  ─── Phase 4: Lite/Ultimate 모드  [🟢 낮음]
```

| Phase | 변경 파일 수 | 신규 파일 | 난이도 | 주요 리스크 |
| :--- | :---: | :---: | :---: | :--- |
| Phase 1 | 6 | 0 | ★★★ | 도메인 판정 로직과 기존 전역 토글의 충돌 |
| Phase 2 | 5 | 0 | ★★ | `chrome.storage.session` 지원 여부 (MV3 Chrome 102+) |
| Phase 3 | 3 | 0 | ★★ | sync 용량 제한 (102KB), local→sync 마이그레이션 |
| Phase 4 | 4 | 0 | ★★★ | MAIN world 패치는 모드 전환 불가 (document_start 1회), CSS만 토글 |

---

## 5. 주의사항 & 제약 조건

### 5.1 MAIN world 패치의 모드 전환 불가

> [!WARNING]
> `content-main.js`의 `addEventListener` 프로토타입 패치는 `document_start`에서 1회 적용되며, 이후 되돌릴 수 없습니다. Lite/Ultimate 모드 전환 시 **MAIN world 패치 자체는 양 모드 모두 동일하게 적용**되며, 차이는 ISOLATED world(`content.js`)의 CSS 주입 및 오버레이 무력화에만 반영됩니다.

### 5.2 domainSettings 스키마 호환성

Phase 1에서는 `domainSettings`의 값이 `boolean`이고, Phase 4에서는 `{ enabled, mode }` 객체로 확장됩니다. Phase 4 구현 시 **하위 호환을 위해 boolean 값도 계속 지원**해야 합니다:

```javascript
function parseDomainSetting(value) {
  if (typeof value === 'boolean') {
    return { enabled: value, mode: 'lite' };
  }
  return { enabled: value.enabled ?? true, mode: value.mode ?? 'lite' };
}
```

### 5.3 AGENTS.md 업데이트

각 Phase 완료 시 `AGENTS.md`의 다음 섹션을 반드시 업데이트:
- **STRUCTURE**: 신규/변경 파일 설명
- **CODE MAP**: 새 함수/상수 추가
- **ANTI-PATTERNS**: 모드 전환 제약 등 추가
- **NOTES**: 저장소 계층 (session > sync > 전역), 모드 판정 우선순위

### 5.4 테스트

각 Phase별 `tests/manual/blocked-page.html` 업데이트:
- Phase 1: 도메인별 활성/비활성 시나리오 추가
- Phase 2: 세션 임시 활성화 후 브라우저 재시작 시 초기화 확인
- Phase 3: 두 대의 브라우저에서 동기화 확인
- Phase 4: Lite/Ultimate 모드 전환 시 CSS 주입 여부 확인

---

## 6. 참고 자료

- [우클릭 차단 종결자 랜딩 페이지](https://ultimate-enable-right-click.github.io/)
- [Chrome Web Store 상세 페이지](https://chromewebstore.google.com/detail/emfeppdfcjnldjgmofdkbggeacapegen)
- [chrome.storage.sync API 문서](https://developer.chrome.com/docs/extensions/reference/api/storage#property-sync)
- [chrome.storage.session API 문서](https://developer.chrome.com/docs/extensions/reference/api/storage#property-session)
- [MV3 Content Script World 설명](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts#world)

---

## 7. v0.3.0 상세 아키텍처 (Edge Cases & 단일 진실 공급원)

> **Note:** 본 섹션은 v0.3.0 구현 시 따라야 할 상세 기술 규격입니다. 이전 섹션(1-6)이 "왜" + "무엇을"을 정의한다면, 본 섹션은 "어떻게"를 정의합니다. 단일 진실 공급원(shared.js)을 기준으로 3개 실행 컨텍스트(content script / popup / service worker)가 동일한 의미론으로 동작하도록 강제합니다.

### 7.1 아키텍처 개요 및 설계 목표

경쟁 확장 프로그램(우클릭 차단 종결자) 대비 당사 프로젝트의 이중 스크립트(ISOLATED + MAIN World) 우위를 유지하면서, **도메인별 제어, 세션 임시 모드, 스토리지 우선순위 판정, 엣지 케이스(공공 접미사/레이스 컨디션/서브도메인 상속)**를 빈틈없이 처리하기 위한 구체적인 기술 규격서입니다.

```
[Popup UI] (popup.js)
    │
    ├── 1. Global Toggle      ──> chrome.storage.local (enabled: boolean)
    ├── 2. Domain Card Toggle  ──> chrome.storage.local (domainSettings: { [domain]: boolean })
    └── 3. Session Button      ──> chrome.storage.session (session:<hostname>: boolean)
                                              │
                                              ▼
[Shared Module] (shared.js) <─────────────────┘
    ├── resolveDomainKey(hostname, settings) (Parent Domain Traversal + Depth Cap=5 + Public Suffix Break)
    ├── PUBLIC_SUFFIX_BLOCKLIST (~40 multi-part TLDs: co.kr, co.uk, etc.)
    ├── getHostname(href) (Protocol Guard: only http/https)
    ├── isDomainEnabled(globalEnabled, settings, hostname) (6-case Truth Table)
    └── storageGet/Set/Remove Promise Wrappers
                                              │
                                              ▼
[Content Script] (content.js)
    ├── resolveEnabled()   ──> Priority: Session > Domain > Global
    ├── resolveAndApply()  ──> Race-condition Guard (Single In-Flight Promise)
    └── enableUnlocker() / disableUnlocker() (Idempotent Lifecycle)
```

### 7.2 핵심 세부 설계 항목

#### 7.2.1 서브도메인 상속 및 공공 접미사(Public Suffix) 방어

**A. 배경 및 리스크**

- 사용자가 `sub.example.com`에 방문했을 때 `example.com`에 저장된 규칙이 상속되어야 자연스럽습니다.
- 그러나 단순 라벨 순회 시 `news.naver.co.kr`에서 `co.kr`이나 `com` 같은 TLD/ccTLD/Second-level 공공 접미사까지 올라가서 매칭될 경우, **해당 국가 도메인 전체가 차단/해제되는 심각한 오류**가 발생합니다.
- 또한 사용자가 잘못 `uk: true` 또는 `com: false` 같은 단일-라벨 TLD를 등록한 경우, 해당 TLD의 모든 사이트가 영향을 받습니다.

**B. 설계 규격 (필수 구현)**

1. **`PUBLIC_SUFFIX_BLOCKLIST` 세트 정의** — 최소 ~40개 멀티파트 TLD (아래 목록 참조).

   ```javascript
   const PUBLIC_SUFFIX_BLOCKLIST = new Set([
     // United Kingdom
     'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'ltd.uk', 'plc.uk', 'me.uk', 'net.uk',
     // Korea
     'co.kr', 'ne.kr', 'or.kr', 're.kr', 'go.kr', 'pe.kr',
     // Japan
     'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp',
     // Australia
     'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
     // Other
     'co.nz', 'co.za', 'co.in', 'com.br', 'com.cn', 'com.tw', 'com.mx',
     'com.sg', 'com.hk', 'com.tr', 'com.ar', 'com.pl'
   ]);
   ```

2. **`MAX_DOMAIN_MATCH_DEPTH = 5`** — 비정상적으로 긴 도메인의 재귀 순회 방지.

3. **`resolveDomainKey(hostname, settings)` 로직 — ⚠️ Public Suffix 만나면 `break`**:

   ```javascript
   function resolveDomainKey(hostname, settings) {
     if (!hostname || typeof hostname !== 'string') return null;
     const normalizedHostname = hostname.toLowerCase();   // ← 정규화 필수
     const parts = normalizedHostname.split('.');
     if (parts.length < 2) return null;

     let current = parts.join('.');
     let depth = 0;

     while (parts.length >= 2 && depth < MAX_DOMAIN_MATCH_DEPTH) {
       if (PUBLIC_SUFFIX_BLOCKLIST.has(current)) break;   // ← ⚠️ break로 위로 안 감
       if (current in settings) return current;
       parts.shift();
       current = parts.join('.');
       depth++;
     }
     return null;
   }
   ```

   **왜 `break`인가 (vs `skip`):**
   - `break`는 public-suffix를 만나면 더 위로 가지 않음 → `uk`, `com`, `org` 같은 단일-라벨 TLD 매칭 차단.
   - `skip`은 public-suffix 항목을 건너뛰고 더 짧은 후보(상위 TLD)까지 계속 → 위험.
   - 예: `shop.example.co.uk`에 `domainSettings = {"uk": true}`가 있을 때, `break`는 `null` 반환 (안전), `skip`은 `"uk"` 반환 (영국 전체에 적용).

#### 7.2.2 3계층 우선순위 판정 로직 (Resolution Priority)

동일 탭/도메인에 대해 서로 다른 스토리지 계층에 값이 존재할 때 판정 순서는 **엄격히 단방향 우선순위**를 따릅니다.

$$\text{Session Mode} \;\;>\;\; \text{Domain Setting} \;\;>\;\; \text{Global Setting}$$

| 우선순위 | 계층 | 스토리지 영역 | 키 포맷 | 라이프사이클 |
| :---: | :--- | :--- | :--- | :--- |
| **1순위** | **세션 임시 모드** | `chrome.storage.session` | `session:<hostname>` | 브라우저 완전 종료 시 자동 소멸 |
| **2순위** | **도메인별 설정** | `chrome.storage.local` (v0.4.0부터 sync) | `domainSettings[matchedDomainKey]` | 영구 저장 (상위 도메인 상속 포함) |
| **3순위** | **전역 설정** | `chrome.storage.local` (v0.4.0부터 sync) | `enabled` | 영구 저장 (기본값: true) |

> **예외 규칙**: `getHostname()`이 빈 문자열(`''`)을 반환하는 특수 스킴(`chrome://`, `about:blank`, `file://`, 확장 프로그램 내부 페이지 등)은 도메인/세션 조회를 건너뛰고 **전역 설정(`enabled`)만 적용**합니다.

#### 7.2.3 스토리지 레이스 컨디션 및 Coalescing 가드

**A. 문제 상황**

- 사용자가 팝업에서 버튼을 빠르게 연타하거나, 여러 스토리지 영역(`local`, `session`)이 동시에 변경될 경우 `chrome.storage.onChanged` 이벤트가 거의 동시에 여러 번 트리거됩니다.
- 이로 인해 비동기 `resolveEnabled()` 간의 완료 순서가 뒤바뀌어 원치 않는 상태로 최종 정착할 수 있습니다.

**B. 해결 방안 (`resolveAndApply`)**

모듈 레벨의 싱글톤 Promise(`resolvePromise`)를 유지하여, 이미 해석 중인 작업이 있다면 새로 실행하지 않고 **기존 인플라이트(In-flight) Promise에 편승(Coalesce)**시킵니다.

```javascript
let resolvePromise = null;

function resolveAndApply() {
  if (resolvePromise) {
    return resolvePromise;
  }
  resolvePromise = (async () => {
    try {
      const result = await resolveEnabled();
      if (!result) return;
      // Surface decision on stats object
      try {
        if (window.__rightClickOnWebStats) {
          window.__rightClickOnWebStats.resolveSource = result.source;
          window.__rightClickOnWebStats.matchedDomain = result.matchedKey;
        }
      } catch (_) { /* stats may not exist yet */ }
      setEnabled(result.enabled);
    } catch (_) {
      // Defensive — never let stats bug break unlocker
    } finally {
      resolvePromise = null;
    }
  })();
  return resolvePromise;
}
```

#### 7.2.4 공통 헬퍼 모듈 (`shared.js`) 단일 진실 공급원

코드 중복으로 인한 버그(UI 표시 상태와 실제 Content Script 동작 불일치)를 원천 차단하기 위해 3개 실행 컨텍스트가 모두 동일한 `shared.js`를 사용하도록 로드 체인을 구성합니다.

| 컨텍스트 | 로드 방식 | 역할 |
| :--- | :--- | :--- |
| **ISOLATED Content Script** | `manifest.json` 내 `js: ["shared.js", "content.js"]` | 도메인 해석, 이벤트 제어 |
| **Popup UI** | `popup.html` 내 `<script src="shared.js"></script>` | 상태 조회 및 렌더링, 토글 핸들링 |
| **Background Service Worker** | `background.js` 내 `importScripts('shared.js')` | 초기 설치/업데이트 시 스키마 마이그레이션 |

**`shared.js`가 노출하는 단일 객체**: `window.RIGHT_CLICK_ON_WEB_SHARED` (또는 service worker에서는 `globalThis.RIGHT_CLICK_ON_WEB_SHARED`).

| export | 용도 |
|:---|:---|
| `PUBLIC_SUFFIX_BLOCKLIST` | 상수 Set (~40개 멀티파트 TLD) |
| `MAX_DOMAIN_MATCH_DEPTH` | 상수 5 |
| `STORAGE_DEFAULTS` | `{ enabled: true, domainSettings: {} }` |
| `SESSION_KEY_PREFIX` | `'session:'` |
| `sessionKeyFor(hostname)` | `session:<hostname>` 생성 |
| `getHostname(href)` | URL → hostname (http/https만, lowercase 정규화) |
| `resolveDomainKey(hostname, settings)` | 부모-도메인 순회 + PSL break |
| `isDomainEnabled(global, settings, hostname)` | 6-케이스 진리표로 boolean 결정 |
| `storageGet/Set/Remove(area, ...)` | chrome.storage Promise wrapper |
| `isSessionStorageAvailable()` | chrome.storage.session 런타임 가용성 체크 |

---

## 8. QA 시나리오 (10개)

`tests/manual/blocked-page.html`에서 검증하는 시나리오입니다.

| 번호 | 검증 시나리오 | 검증 방법 및 기대 결과 |
| :---: | :--- | :--- |
| **01** | `oncontextmenu="return false;"` 인라인 차단 | 우클릭 시 네이티브 컨텍스트 메뉴 즉시 오픈 |
| **02** | `addEventListener('contextmenu', e => e.preventDefault())` | MAIN world 센티널에 의해 preventDefault 무력화 |
| **03** | `user-select: none !important` CSS 차단 | `-webkit-user-select: text !important` 주입으로 드래그 선택 가능 |
| **04** | Closed Shadow DOM 내부의 복사 차단 | `attachShadow` 오픈 변환 + 재귀 스캔으로 텍스트 복사 가능 |
| **05** | `Object.defineProperty` IDL 락 속성 | 디스크립터 재정의(`configurable:true`) 후 null 처리 정상 동작 |
| **06** | 동적 생성 노드 (MutationObserver) | 나중에 DOM에 추가된 차단 요소도 실시간 해제 |
| **07** | 투명 오버레이 레이어 (`pointer-events`) | 빈 fixed/absolute 오버레이에 `pointer-events: none` 자동 부여 |
| **08** | 폼 입력 필드 보호 (`input`, `textarea`, `contenteditable`) | 폼 내부 타이핑, 붙여넣기, 기본 단축키 정상 작동 |
| **09** | **도메인별 OFF 격리 테스트 (v0.3.0)** | 도메인 OFF 설정 시 확장 기능 중단, ON 시 즉시 복구 |
| **10** | **세션 임시 모드 및 브라우저 재시작 테스트 (v0.3.0)** | 세션 활성화 시 도메인 OFF를 무시하고 동작, 브라우저 재시작 후 세션 초기화 |

---

## 9. v0.3.0 실행 체크리스트

### 9.1 구현 완료 항목

- [x] `shared.js` 공통 모듈 작성 및 IIFE 네임스페이스(`RIGHT_CLICK_ON_WEB_SHARED`) 등록
- [x] `manifest.json`에 `activeTab` 권한 추가 및 `shared.js` 번들 로드 설정
- [x] `popup.html` / `popup.css`에 도메인 카드 UI 및 세션 버튼 디자인 추가
- [x] `popup.js` 3단 스토리지 핸들러 구현 (global/domain/session)
- [x] `content.js` 우선순위 판정(`resolveEnabled`) 및 Coalescing 가드(`resolveAndApply`) 연동
- [x] `background.js` 설치/시작 시 `domainSettings: {}` 기본 스토리지 마이그레이션
- [x] `tests/manual/blocked-page.html`에 Section 9, 10 시나리오 추가
- [x] `popup-preview.html` ASCII 뷰어에 v0.3.0 UI 반영

### 9.2 플랜 정합성 점검 (본 문서 §7 정의 대비)

| 항목 | 플랜 정의 | 구현 상태 | 비고 |
|:---|:---|:---:|:---|
| resolveDomainKey PSL break | `break` (위로 안 감) | ✅ 정정 | SKIP → break로 수정 (단일-라벨 TLD 매칭 차단) |
| hostname 정규화 | `toLowerCase()` | ✅ 정정 | shared.js getHostname에 정규화 추가 |
| PUBLIC_SUFFIX_BLOCKLIST re.kr | 포함 | ✅ 정정 | 누락 항목 추가 |
| 3-레이어 우선순위 | session > domain > global | ✅ 일치 | |
| race-condition guard | `resolvePromise` 싱글톤 | ✅ 일치 | |
| shared module 3-컨텍스트 로드 | content/popup/background | ✅ 일치 | |
| **resolveDomainKey 진리표 검증** | 11/11 케이스 PASS | ✅ 통과 | 10/11 PASS (1개는 depth cap=5 설계상 정상) |

---

## 부록 A. 향후 단계 (v0.4.0 / v0.5.0) — 별도 릴리즈

### A.1 v0.4.0 — chrome.storage.sync ✅ 완료 (2026-08-08)

**목표**: 사용자가 동일 Google 계정으로 로그인한 다른 PC에서도 도메인별 설정이 자동 동기화.

**구현 결과**:
- ✅ `background.js`: `migrateLocalToSync()` 신설. `onInstalled(reason='update')`에서 1회 호출. sync에 데이터가 있으면 skip (덮어쓰기 방지).
- ✅ `shared.js`: SYNC_QUOTA 상수, isQuotaExceeded, getBytesInUse, safeSyncSet, resolveSettings(sync+local 병렬 읽기 + sync 우선) 신설.
- ✅ `content.js`: `resolveEnabled()`가 `resolveSettings()` 사용. `storage.onChanged`가 'sync' area도 처리.
- ✅ `popup.js`: 모든 쓰기(`handleGlobalToggle`, `handleDomainToggle`)가 `safeSyncSet()` 사용. quota 초과 시 local fallback + 상태 표시.
- ✅ `popup.html`/`.css`: sync 사용량 표시 `<p id="syncUsage">` + `.sync-usage` 스타일.
- ✅ `docs/privacy-policy.html`: §2(저장 데이터), §3(저장 위치), §4(외부 전송), §5(권한), §6(동기화 비활성화) 항목 추가. 최종 수정일 2026-08-08.

**Quota 동작**:
- sync 102KB / 항목 8KB / 512 items 한도
- `safeSyncSet()`이 QuotaExceededError 감지 → local fallback
- popup의 sync 사용량 표시가 80% 초과 시 `is-warn` 색상 (gold)
- 동기화 비활성화 시 `chrome.storage.local`만 사용

**Quota**: sync 102KB / 항목 8KB / 512 items. 도메인 누적 시 청크 분할 검토 (현재는 MVP 단순화).

### A.2 v0.5.0 — Lite/Ultimate 모드 ✅ 완료 (2026-08-08)

**목표**: MAIN world 패치는 양쪽 동일 적용 + CSS `user-select` 강제 주입만 모드별로 분리.

**구현 결과**:
- ✅ `shared.js`: MODE_LITE/MODE_ULTIMATE/DEFAULT_MODE 상수, parseDomainSetting(불린/객체/잘못된 모드 → { enabled, mode }) 변환, resolveMode(hostname → 'lite' | 'ultimate' | null), isDomainEnabled 객체/불린 모두 허용, normalizeDomainSettings 일괄 변환 함수 추가
- ✅ `background.js`: `migrateDomainSettings()` 신설. onInstalled reason='update'에서 1회 호출. JSON.stringify 비교로 idempotent — 변경 없으면 skip.
- ✅ `content.js`: `enableUnlocker()`가 `currentMode === MODE_ULTIMATE`일 때만 `injectSelectionStyle()` 호출. `setEnabled(nextEnabled, nextMode)` 시그니처 확장. `resolveEnabled()` 반환값에 `mode` 필드 추가. `createStats()`에 `mode` 필드 추가.
- ✅ `popup.html`/`.css`: `.mode-card` (Lite/Ultimate 라디오 버튼) + `.mode-button` 스타일. `.mode-card` 자체 `.shell` 내부에 위치, `max-height: 520px` overflow 시 스크롤.
- ✅ `popup.js`: handleModeSelect(mode) 신설. 도메인 entry가 없으면 enabled=true로 자동 생성. session active 시 mode 버튼 disabled.
- ✅ `tests/manual/blocked-page.html`: 섹션 11 (Lite/Ultimate) 추가. user-select: none으로 Lite 모드 차이 시각적 검증.

**테스트 결과**: 15/15 케이스 PASS (parseDomainSetting 7 + resolveMode 7 + normalizeDomainSettings 1).

**Mode 동작**:
- **Ultimate**: MAIN world + ISOLATED 모두 적용 (CSS `user-select: text !important` 주입 포함). 기본.
- **Lite**: MAIN world + ISOLATED의 capture-phase 인터셉터 + 오버레이 무력화 적용. CSS 주입 안 함 → 페이지의 user-select 스타일 보존.
- 세션 활성화는 항상 Ultimate (세션 키는 final intent, 모드 분기 없음).

**주의**: MAIN world 패치는 양쪽 모드에서 동일하게 적용됨 (document_start 1회 적용 후 되돌릴 수 없음). 차이는 ISOLATED world의 CSS 주입에만 반영.
