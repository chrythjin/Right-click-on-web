# Right-click on Web

[![Chrome MV3](https://img.shields.io/badge/Manifest-V3-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![WASM OCR](https://img.shields.io/badge/OCR-100%25%20Offline%20WASM-34A853?style=flat-square)](https://github.com/naptha/tesseract.js)
[![No Telemetry](https://img.shields.io/badge/Privacy-Zero%20Network-EA4335?style=flat-square)](#privacy--security)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

**Right-click on Web** is a modern, no-build, privacy-first Chrome (Manifest V3) extension designed to **unblock right-click menus, text selection, copy/cut shortcuts, and drag-and-drop** on restrictive websites. It also features a **100% offline on-device WASM OCR engine** to extract unselectable text from images, Canvas elements, and locked regions directly in your browser.

---

## 🌟 Key Features

### 1. Dual-World Unblocking Engine
* **Preemptive Prototype Patching (`MAIN` World)**: Runs at `document_start` to neutralize page-level blocking event listeners (`contextmenu`, `selectstart`, `dragstart`) and convert `closed` Shadow DOMs to `open` before restrictive page scripts execute.
* **DOM Cleanup & Capture Interception (`ISOLATED` World)**: Strips inline `on*` blocking attributes, injects non-intrusive selection styles, and overrides empty pointer-blocking overlays.
* **Form & Input Preservation**: Automatically detects editable fields (`<input>`, `<textarea>`, `contenteditable`) to preserve standard native editing and paste behaviors.

### 2. 100% On-Device Offline WASM OCR
* **Zero External Calls**: Runs Tesseract.js directly inside a local Chrome Offscreen Document. No screenshot or pixel data ever leaves your device.
* **Interactive Area Crop**: Press <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd> (<kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd> on macOS) to drag and capture any visible screen area.
* **Image Context Menu**: Right-click on any image to perform direct instant OCR.
* **Canvas Preprocessing Pipeline**: Built-in adaptive upscaling, binarization, and contrast enhancement filters.

### 3. Smart OCR Text Editor & Post-Processing
* **Smart Text Cleanup**: Automatically removes zero-width characters, joins wrapped lines/hyphenated words, and collapses redundant spaces.
* **Custom Correction Dictionary**: Define local word-replacement rules to automatically fix recurring OCR typos.
* **Full Editor Support**: In-place text editing, word search/replace, character counters, copy to clipboard, and Undo/Redo stack.

### 4. Advanced Domain & Profile Controls
* **Granular Per-Domain Settings**: Enable or disable unblocking per site with parent-domain inheritance and Public Suffix List (PSL) protection.
* **Lite vs. Ultimate Modes**: Choose between *Lite* (JS unblock only) and *Ultimate* (forced CSS selection & drag enablement).
* **Transient Session Mode**: Temporarily enable bypass for the current browser session without permanently modifying site rules.
* **Settings Transfer & Sync**: Export/import settings via JSON files and synchronize rules seamlessly across devices via `chrome.storage.sync`.

### 5. UI & Accessibility
* **Chrome Side Panel**: Inspect and edit OCR results or manage domain rules side-by-side with the active webpage.
* **Themes & High-Zoom Reflow**: Supports Dark (Motorsport Rosso Corsa), Neon, and Light themes with full keyboard accessibility (<kbd>Tab</kbd>, Arrow keys) and responsive reflow up to 200% zoom.

---

## 🏗️ Architecture Overview

```
[Web Page]
    │
    ├── MAIN World (content-main.js)
    │     ├── Prototype patch: EventTarget.prototype.addEventListener
    │     ├── Prototype patch: Element.prototype.attachShadow (closed -> open)
    │     └── Sentinel listeners (Preserves AbortSignal contract)
    │
    ├── ISOLATED World (content.js, shared.js)
    │     ├── Capture-phase event interceptors
    │     ├── Inline blocking attribute removal
    │     ├── MutationObserver & periodic DOM rescan
    │     └── Reversible CSS selection injection
    │
    └── Offscreen Document (offscreen.html / offscreen.js)
          ├── Offline Tesseract.js (WASM + Local traineddata)
          ├── Canvas preprocessing (Grayscale, Thresholding, Inversion)
          └── Zero network connectivity sandbox
```

---

## 📦 Installation (Load Unpacked)

No Node.js build step or bundler is required. You can load the repository directly into Chrome:

1. Clone or download this repository:
   ```bash
   git clone https://github.com/chrythjin/Right-click-on-web.git
   ```
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the root directory of this repository.
5. The extension is now active and ready to use!

---

## ⌨️ Shortcuts & Usage

| Action | Shortcut (Windows/Linux) | Shortcut (macOS) | Description |
| :--- | :--- | :--- | :--- |
| **Area OCR Capture** | <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd> | <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd> | Open interactive screen crop overlay |
| **Image OCR** | Right-click image → *이미지에서 텍스트 추출 (OCR)* | Right-click image → *이미지에서 텍스트 추출 (OCR)* | Extract text directly from target image |
| **Cancel Crop** | <kbd>Esc</kbd> | <kbd>Esc</kbd> | Dismiss active crop selection |
| **Side Panel** | Open from Extension Popup | Open from Extension Popup | Manage settings & OCR editor in side panel |

---

<a id="privacy--security"></a>
## 🔒 Privacy & Security

* **Zero External Communication**: Does not perform any network requests, analytics, telemetry, or remote code execution.
* **In-Memory Capture Processing**: Screen crop pixels are held in memory solely during OCR execution and are immediately discarded.
* **Opt-In Local History**: OCR history is disabled by default. If enabled, only plain text is stored locally (`chrome.storage.local`, max 20 items / 30 days) and never synced.

---

## 🧪 Testing & Verification

Unit tests and release gates are provided out of the box:

```powershell
# Run all unit tests (Node.js test runner)
node --test tests/unit/*.test.js

# Run release-gate verification script
.\scripts\verify.ps1
```

---
---

# 🇰🇷 한국어 요약 (Korean Summary)

## 📌 개요
**Right-click on Web**은 웹페이지에서 텍스트 선택, 우클릭, 복사, 드래그를 차단하는 스크립트를 원천 무력화하고, 선택할 수 없는 이미지 및 화면 속 글자를 **100% 기기 내 로컬 WASM OCR**로 추출하는 브라우저 확장 프로그램입니다.

## ✨ 핵심 기능
1. **강력한 차단 해제 (이중 스크립트 엔진)**:
   - `MAIN world` 프로토타입 패치로 페이지 스크립트 실행 전에 차단 리스너 및 Closed Shadow DOM을 선제 무력화.
   - `ISOLATED world` 인터셉터로 인라인 차단 속성 제거, 우클릭/드래그/복사 단축키(`Ctrl+C`, `Ctrl+A` 등) 복원.
2. **100% 온디바이스 오프라인 WASM OCR**:
   - 외부 서버 통신 없이 브라우저 내 오프스크린 문서에서 Tesseract.js WASM + 한국어/영어 로컬 모델로 텍스트 추출.
   - 단축키 (<kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd>) 화면 영역 드래그 캡처 및 이미지 우클릭 즉시 OCR 지원.
3. **스마트 OCR 결과 편집기**:
   - 추출된 텍스트의 불필요한 줄바꿈/하이픈 자동 정리, 사용자 교정 사전, 찾기/바꾸기, 실행 취소(Undo/Redo) 지원.
4. **도메인별 세밀한 제어 & 사이드 패널**:
   - 사이트별 개별 ON/OFF, 임시 세션 모드, Lite/Ultimate 모드, 브라우저 간 설정 동기화.
   - Chrome 사이드 패널에서 웹서핑과 동시에 OCR 결과 편집 및 도메인 설정 관리.
5. **완벽한 개인정보 보호**:
   - 원격 통신 0, 텔레메트리 0, 데이터 수집 0. 캡처 픽셀은 메모리에서 처리 후 즉시 파기.

## 🚀 설치 방법
1. 저장소를 클론하거나 ZIP 다운로드 후 압축 해제.
2. Chrome에서 `chrome://extensions` 접속 후 우측 상단 **[개발자 모드]** 활성화.
3. **[압축해제된 확장 프로그램을 로드합니다]**를 클릭하고 본 저장소 폴더 선택.

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).
