# 🖋️ 墨水日記 · Ink Diary

> Reskin Claude, ChatGPT, and Gemini into an enchanted handwritten diary — you write in ink, the page replies.
> 把 Claude、ChatGPT、Gemini 三大 AI 偽裝成一本會回話的手寫魔法日記 —— 你落筆，紙頁回字。

**Local-only · No tracking · Fully open source ｜ 純本機 · 不追蹤 · 完全開源**

[English](#english) ｜ [繁體中文](#繁體中文)

A Chrome extension that overlays a parchment "magic diary" on top of [Claude](https://claude.ai), [ChatGPT](https://chatgpt.com), and [Gemini](https://gemini.google.com).
You write on the page, it relays your words to your already‑logged‑in AI, and the reply surfaces as ink — letter by letter, like an enchanted grimoire writing back. One experience, three AI platforms.

一個在 [Claude](https://claude.ai)、[ChatGPT](https://chatgpt.com)、[Gemini](https://gemini.google.com) 三大 AI 對話平台上蓋一層羊皮紙「魔法日記」的 Chrome 擴充。你在紙頁上寫字，它把內容轉交給你**已登入的 AI**，回應再以墨水浮現 —— 字字滲入紙面，宛如一本會回話的魔法古籍。一個擴充，三大平台，同款沉浸體驗。

### 支援平台 / Supported Platforms

| 平台 | 網域 | 狀態 |
|------|------|------|
| Claude | claude.ai | 支援（selectors 已驗證） |
| ChatGPT | chatgpt.com、chat.openai.com | 支援（selectors 待 live 驗證，見 T4-E） |
| Gemini | gemini.google.com | 支援（selectors 待 live 驗證，見 T4-E） |

---

## English

### Trust & Transparency — read this first

This project is built to be **verifiable, not just "trust me."** Both Taiwanese and international users should be able to confirm it is safe.

- **No servers of ours.** The extension talks to nothing we operate. There is **no backend, no analytics, no telemetry, no data collection**.
- **No network calls in the code.** `content.js` (~730 lines) contains **zero** `fetch`, `XMLHttpRequest`, `WebSocket`, or `sendBeacon`. Verify it yourself:
  ```bash
  grep -nE "fetch\(|XMLHttpRequest|WebSocket|sendBeacon" content.js   # → nothing
  ```
- **Your conversation data never leaves your browser.** The extension reads/writes the page DOM in your tab (on Claude, ChatGPT, or Gemini). It never touches your password, session cookies, or any API key, and never copies your conversations anywhere.
- **Zero external requests — not even fonts.** Both typefaces — Tangerine (English) and Chenyuluoyan (Chinese) — are **bundled locally** in `fonts/` and loaded over `chrome-extension://`. The extension contacts no outside host whatsoever.
- **Minimal permissions** (see table below) — no `tabs`, no `<all_urls>`, no remote code execution.
- **Open source, MIT-licensed.** Every line is in this repo. Fonts ship with their original OSS licenses in `licenses/`.
- **Codebase is in Traditional Chinese (zh‑Hant).** UI strings, comments, and docs use 繁體中文.

### Permissions, explained

| Permission | Why it's needed |
|---|---|
| `storage` | Remember your toggles (diary on/off, persona on/off). Synced by Chrome only; never read by us. |
| host `https://claude.ai/*` | To draw the diary overlay and bridge the conversation on Claude. |
| host `https://chatgpt.com/*` | To draw the diary overlay and bridge the conversation on ChatGPT. |
| host `https://chat.openai.com/*` | Legacy ChatGPT domain — redirects to chatgpt.com; covered for users with bookmarked old URLs. |
| host `https://gemini.google.com/*` | To draw the diary overlay and bridge the conversation on Gemini. |
| `web_accessible_resources: fonts/*` | So the page can load the locally bundled Traditional Chinese font over `chrome-extension://`. |

That is the complete list. There is no `tabs`, `cookies`, `webRequest`, `<all_urls>`, or background service worker.

### Verify it yourself

```bash
# 1. No network calls
grep -rnE "fetch\(|XMLHttpRequest|WebSocket|sendBeacon" content.js popup.js
# 2. See exactly which hosts/resources are declared
cat manifest.json
# 3. Read the whole thing — it's ~730 lines
less content.js
```

### Install (load unpacked)

1. Open Chrome → `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select this `riddle-diary` folder
4. Go to `https://claude.ai`, `https://chatgpt.com`, or `https://gemini.google.com`, open a conversation — the diary appears

### Usage

- **Open the book** — tap the closed cover to flip it open.
- **Write** — type at the bottom of the page; `Enter` to send, `Shift+Enter` for a new line. (IME composition is respected — your first Enter just confirms candidates.)
- **Bookmark / history** — click the red ribbon on the left edge to slide out your past conversations; click one to switch, or "✚ open a new page" to start fresh.
- **Peek** — press and hold "窺視" (top‑right) to briefly see the real AI interface underneath.
- **Close** — "闔上" (top‑right) removes the disguise; re‑open it from the toolbar icon.

### How it works

1. A content script overlays a full‑screen parchment book on Claude, ChatGPT, or Gemini — whichever tab you have open.
2. On send, it writes your text into the AI's real input box and clicks send.
3. It polls for the latest assistant message, cleans it (drops accessibility labels / buttons / thinking blocks), and renders the reply as ink once the AI finishes.

Each platform has its own selector configuration file: `platforms/claude.cjs`, `platforms/chatgpt.cjs`, `platforms/gemini.cjs`. When a platform changes its markup, you usually only need to update that platform's `selectors` object.

### Fonts & licenses

- **Chinese — Chenyuluoyan (辰宇落雁體)**, OFL 1.1, bundled in `fonts/`.
- **English — Tangerine**, SIL OFL 1.1 (Google Fonts), bundled locally in `fonts/`.
- All license files are kept in [`licenses/`](licenses/). See [`licenses/README.md`](licenses/README.md).

### License

Code: **MIT** — see [`LICENSE`](LICENSE). Bundled fonts keep their own OSS licenses.

---

## 繁體中文

### 信任與透明度 —— 請先看這段

這個專案的設計原則是「**可以自己驗證，而不是叫你相信我**」。台灣使用者與外國使用者都應該能自行確認它是安全的。

- **沒有我們的伺服器。** 擴充不會跟任何我們經營的服務通訊。**沒有後端、沒有分析、沒有遙測、不蒐集任何資料**。
- **程式碼裡沒有任何對外連線。** `content.js`（約 730 行）裡 **完全沒有** `fetch`、`XMLHttpRequest`、`WebSocket`、`sendBeacon`。你可以自己驗：
  ```bash
  grep -nE "fetch\(|XMLHttpRequest|WebSocket|sendBeacon" content.js   # → 什麼都沒有
  ```
- **你的對話資料不會離開瀏覽器。** 擴充只在你的分頁裡讀寫 AI 平台（Claude、ChatGPT、Gemini）的頁面 DOM，從不碰你的密碼、session cookie 或任何 API key，也不會把你的對話複製到任何地方。
- **零對外請求 —— 連字型都不連網。** 兩款字型 Tangerine（英文）與辰宇落雁體（中文）都**打包在本地 `fonts/`**，以 `chrome-extension://` 載入。擴充不向任何外部主機發出請求。
- **最小權限**（見下表）—— 沒有 `tabs`、沒有 `<all_urls>`、不執行任何遠端程式碼。
- **開源、採 MIT 授權。** 每一行都在這個 repo 裡。字型也附上原始開源授權於 `licenses/`。
- **程式碼以繁體中文（zh‑Hant）撰寫。** 介面字串、註解、文件都用繁體中文。

### 權限說明

| 權限 | 為什麼需要 |
|---|---|
| `storage` | 記住你的開關（日記偽裝、人設）。只由 Chrome 同步，我們讀不到。 |
| host `https://claude.ai/*` | 在 Claude 頁面畫日記介面、橋接對話。 |
| host `https://chatgpt.com/*` | 在 ChatGPT 頁面畫日記介面、橋接對話。 |
| host `https://chat.openai.com/*` | ChatGPT 的舊版網域（書籤使用者），現多轉址到 chatgpt.com。 |
| host `https://gemini.google.com/*` | 在 Gemini 頁面畫日記介面、橋接對話。 |
| `web_accessible_resources: fonts/*` | 讓頁面能用 `chrome-extension://` 載入本地打包的中文字型。 |

這就是全部。沒有 `tabs`、`cookies`、`webRequest`、`<all_urls>`，也沒有背景 service worker。

### 自己驗證

```bash
# 1. 沒有對外連線
grep -rnE "fetch\(|XMLHttpRequest|WebSocket|sendBeacon" content.js popup.js
# 2. 看清楚宣告了哪些網域／資源
cat manifest.json
# 3. 整份讀過 —— 只有約 730 行
less content.js
```

### 安裝（載入未封裝項目）

1. Chrome → `chrome://extensions`
2. 開啟右上「**開發人員模式**」
3. 點「**載入未封裝項目**」→ 選這個 `riddle-diary` 資料夾
4. 前往 `https://claude.ai`、`https://chatgpt.com` 或 `https://gemini.google.com` 並開啟一個對話，日記就會出現

### 使用

- **翻開**：點擊闔著的書封翻開。
- **落筆**：在頁面底部輸入；`Enter` 送出、`Shift+Enter` 換行。（尊重輸入法組字 —— 注音/拼音選字的第一個 Enter 只會確認選字。）
- **書籤／歷史**：點左緣紅色緞帶滑出過往對話；點一條切換，或「✚ 翻開新的一頁」開新對話。
- **窺視**：長按右上「窺視」可暫時看一眼底下真實的 AI 介面。
- **闔上**：右上「闔上」關掉偽裝；可從工具列圖示重新開啟。

### 運作原理

1. content script 在 Claude、ChatGPT 或 Gemini（依當前分頁）上蓋一層全螢幕羊皮紙書頁。
2. 送出時，把文字寫進 AI 真正的輸入框並按送出。
3. 輪詢最新一則助理訊息、清掉雜訊（無障礙標籤／按鈕／思考區塊），等 AI 寫完後把回覆以墨水浮現。

各平台設定獨立存放：`platforms/claude.cjs`、`platforms/chatgpt.cjs`、`platforms/gemini.cjs`。平台改版時，通常只要更新該平台檔案的 `selectors`。

### 字型與授權

- **中文 — 辰宇落雁體**，OFL 1.1，打包於 `fonts/`。
- **英文 — Tangerine**，SIL OFL 1.1（來自 Google Fonts），打包於 `fonts/`。
- 所有授權檔保存在 [`licenses/`](licenses/)，說明見 [`licenses/README.md`](licenses/README.md)。

### 授權

程式碼：**MIT** —— 見 [`LICENSE`](LICENSE)。打包字型保留各自的開源授權。
