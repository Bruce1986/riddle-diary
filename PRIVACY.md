# Privacy Policy ｜ 隱私政策

_Last updated / 最後更新：2026-07-07_

## English

**Short version: this extension collects nothing and sends nothing.**

- **No data collection.** We do not collect, store, or transmit any personal data, conversation content, or usage statistics.
- **No servers.** There is no backend operated by this project. The extension communicates with no service we control.
- **No tracking / analytics / telemetry.** None. The code contains no `fetch`, `XMLHttpRequest`, `WebSocket`, or `sendBeacon`.
- **Local only.** All behaviour happens inside your browser tab on the supported hosts (`claude.ai`, `chatgpt.com`, `chat.openai.com`, `gemini.google.com`). Your conversations stay between you and the underlying AI provider (Anthropic, OpenAI, or Google), exactly as they would without this extension.
- **Credentials are never touched.** The extension does not read your password, session cookies, or any API key. It uses your existing logged‑in session via the page, the same way the website itself does.
- **Zero external requests — not even fonts.** Both typefaces are bundled locally and loaded over `chrome-extension://`. No outside host is contacted at all.
- **Settings storage.** Your on/off toggles are saved with `chrome.storage.sync` (handled by Chrome). They never reach us.

You can verify all of the above by reading the source — it is fully open and about 830 lines of `content.js`, plus a small popup and the `platforms/` and `i18n/` config files.

## 繁體中文

**一句話：這個擴充不蒐集任何東西，也不送出任何東西。**

- **不蒐集資料。** 我們不蒐集、不儲存、不傳送任何個人資料、對話內容或使用統計。
- **沒有伺服器。** 本專案沒有任何後端，擴充不會跟任何我們經營的服務通訊。
- **不追蹤／不分析／不遙測。** 完全沒有。程式碼裡沒有 `fetch`、`XMLHttpRequest`、`WebSocket`、`sendBeacon`。
- **純本機運作。** 所有行為都發生在你瀏覽器的支援站台分頁內（`claude.ai`、`chatgpt.com`、`chat.openai.com`、`gemini.google.com`）。你的對話一如往常只在你與底層 AI 服務商（Anthropic、OpenAI 或 Google）之間。
- **不碰任何憑證。** 擴充不讀你的密碼、session cookie 或任何 API key，只是沿用你頁面上已登入的狀態 —— 跟網站本身一樣。
- **零對外請求 —— 連字型都不連網。** 兩款字型都打包在本地，以 `chrome-extension://` 載入，不向任何外部主機發出請求。
- **設定的儲存。** 你的開關用 `chrome.storage.sync`（由 Chrome 處理）保存，不會傳到我們這裡。

以上每一點你都能透過閱讀原始碼自行驗證 —— 全部開源，`content.js` 約 830 行，加上一個小型 popup 與 `platforms/`、`i18n/` 設定檔。
