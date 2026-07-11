# Chrome Web Store Listing — 墨水日記 · Ink Diary

> Last Updated: 2026-07-07

## Store Listing

**Extension Name** [REQUIRED]
墨水日記 · Ink Diary

**Short Description** [REQUIRED]
支援 Claude / ChatGPT / Gemini — 把 AI 對話介面化身手寫魔法日記：落筆，墨水滲入羊皮紙；日記以墨水浮現回應。純本機、不追蹤。

**Detailed Description** [REQUIRED]
墨水日記（Ink Diary）是一個趣味主題修改（Reskin）擴充功能，將 Claude、ChatGPT 與 Gemini 三大 AI 對話介面同步改造為沉浸式的手寫魔法日記視覺風格，靈感來自奇幻文學中「會回話的古老日記本」意象。一個擴充，三大 AI 平台，同款魔法體驗。

當你輸入文字時，墨水會如同施了魔法般緩緩滲入羊皮紙頁；當 AI 回應時，字跡也以手寫墨水形式逐漸浮現，字字傾訴，宛如一本有靈魂的古老魔法書。

支援平台：
• Claude（claude.ai）
• ChatGPT（chatgpt.com、chat.openai.com）
• Gemini（gemini.google.com）

※ 首發版本以 Claude 驗證最完整；ChatGPT 與 Gemini 的介面適配仍在持續實測中，若遇到無法送出或畫面異常，歡迎回報。

主要功能：
• 沉浸式手寫魔法日記視覺與墨水浮現動態特效。
• 點擊書封翻開日記本，點擊「闔上」即可恢復原始 AI 介面。
• 點擊左側紅色緞帶書籤可滑出過往的對話章節，方便快速切換。
• 提供「窺視」功能，長按即可短暫看一眼底下真實的 AI 介面。
• 可自由選擇開啟或關閉「日記偽裝」以及「魔法日記人設（自動前置提示詞）」。
• 語言選擇：可選擇繁體中文、English 或自動偵測。

如何使用：
1. 前往 https://claude.ai、https://chatgpt.com 或 https://gemini.google.com 並登入您的帳號。
2. 開啟或新建一個對話，日記本介面便會自動覆蓋顯示。
3. 在頁面底部直接落筆輸入文字，按下 Enter 送出，Shift + Enter 換行。
4. 若要暫時查看原始介面，請長按右上角的「窺視」按鈕。
5. 點擊右上角的「闔上」可暫時關閉此主題；關閉後右下角會浮出小書本「翻回日記」按鈕，點一下即可翻回（也可從 Chrome 工具列的擴充功能圖示重新開啟）。

隱私說明：
本擴充功能完全在本地運作，不包含任何對外連線代碼（無 fetch、XMLHttpRequest 等）。我們不會蒐集、儲存或傳送您的任何個人資料、對話內容或使用數據。您的所有設定皆保存在您的本地瀏覽器中。

免責聲明：
本擴充功能為非官方的趣味主題修改（Reskin）工具，與 Anthropic (Claude)、OpenAI (ChatGPT)、Google (Gemini) 無任何關聯、授權或代言關係。

**Category** [REQUIRED]
Fun

**Single Purpose** [REQUIRED]
將 Claude、ChatGPT、Gemini 三大 AI 對話介面美化為手寫魔法日記的沉浸式視覺風格，提供墨水浮現等互動特效。

**Primary Language** [REQUIRED]
zh-Hant (繁體中文)


## English Locale (en) — Chrome Web Store Multi-Locale Listing

> Ready to paste when uploading the English locale in the Chrome Web Store Developer Dashboard.
> Last Updated: 2026-07-07

**Extension Name** [REQUIRED]
Ink Diary

**Short Description** [REQUIRED]
Claude, ChatGPT & Gemini: turn any AI chat into a handwritten magical diary — ink seeps into parchment, the diary replies. Private.

**Detailed Description** [REQUIRED]
Ink Diary is a playful visual reskin extension that transforms the Claude, ChatGPT, and Gemini conversation interfaces into an immersive handwritten magical diary — inspired by the archetype of the ancient, sentient journal found in fantasy literature. One extension, three AI platforms, the same magical experience.

When you type, your words seep into the parchment as though touched by some old enchantment; when the AI responds, letters slowly surface in handwritten ink, line by careful line, as though an unseen quill were writing of its own accord.

Supported platforms:
• Claude (claude.ai)
• ChatGPT (chatgpt.com, chat.openai.com)
• Gemini (gemini.google.com)

Note: this first release is most thoroughly verified on Claude; ChatGPT and Gemini interface support is still undergoing live verification — please report anything that fails to send or renders incorrectly.

Features:
• Immersive handwritten magical-diary visuals with ink-reveal animation effects.
• Tap the book cover to open the diary; click "Close" to return to the original AI interface at any time.
• Click the red ribbon bookmark on the left to slide open your past conversation chapters for quick navigation.
• Hold the "Peek" button to briefly glimpse the real AI interface underneath.
• Freely toggle the "diary disguise" and the "magical diary persona (auto-prepended prompt)" on or off.
• Language selector: choose Traditional Chinese, English, or automatic detection.

How to use:
1. Go to https://claude.ai, https://chatgpt.com, or https://gemini.google.com and sign in.
2. Open or start a conversation — the diary interface will appear automatically.
3. Write in the text area at the bottom; press Enter to send, Shift+Enter for a new line.
4. To view the original interface temporarily, hold the "Peek" button in the top-right corner.
5. Click "Close" in the top-right to dismiss the theme; a small floating book button appears at the bottom-right to bring it back with one click (or reopen it from the Chrome toolbar extension icon).

Privacy:
This extension operates entirely locally. It contains no outbound network requests (no fetch, XMLHttpRequest, WebSocket, or any other form of external communication). We collect, store, and transmit none of your personal data, conversation content, or usage metrics. All preferences are saved in your local browser storage.

Disclaimer:
This is an unofficial, fan-made visual reskin tool with no affiliation, authorization, or endorsement from Anthropic (Claude), OpenAI (ChatGPT), or Google (Gemini).

**Single Purpose** [REQUIRED]
Visually reskin Claude, ChatGPT, and Gemini conversation interfaces as an immersive handwritten magical diary, with ink-reveal animation effects.

**Known Issues:** The extension relies on each platform's DOM structure (selectors). If Claude, ChatGPT, or Gemini significantly updates its frontend, the overlay may break until the corresponding `platforms/*.js` selectors are updated.


## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Created (V4 Tangerine "Ink" on leather) | `icons/icon-128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 3 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 4 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 5 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | |

### Screenshot Notes
Chrome Web Store 允許最多 5 張截圖；建議採「跨三站同款體驗」作為主軸：

- **Screenshot 1**：Claude 版 — 日記本翻開的書封頁（深棕皮革封面，金色書法「墨」字標記）。
- **Screenshot 2**：Claude 版 — 手寫字跡與羊皮紙對話主介面，包含「窺視」與「闔上」按鈕。
- **Screenshot 3**：ChatGPT 版 — 同款日記介面覆蓋於 ChatGPT 對話頁，突顯「同一擴充，三平台通用」賣點。
- **Screenshot 4**：Gemini 版 — 同款日記介面覆蓋於 Gemini 對話頁。
- **Screenshot 5**：任一平台 — 點擊紅色緞帶書籤滑出左側過往章節（歷史紀錄）的狀態。


## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | 用於儲存與同步使用者的偏好設定（例如是否啟用日記偽裝、是否啟用魔法日記人設模式）。 |
| `https://claude.ai/*` | matches (implicit host) | 為了在 Claude 頁面上覆蓋日記本主題，並將使用者的手寫輸入橋接到底層的真實 Claude 輸入框中。 |
| `https://chatgpt.com/*` | matches (implicit host) | 為了在 ChatGPT 頁面上覆蓋日記本主題，並將使用者的手寫輸入橋接到底層的真實 ChatGPT 輸入框中。 |
| `https://chat.openai.com/*` | matches (implicit host) | ChatGPT 舊版網域（書籤使用者），現多轉址到 chatgpt.com，仍宣告以確保覆蓋相容性。 |
| `https://gemini.google.com/*` | matches (implicit host) | 為了在 Gemini 頁面上覆蓋日記本主題，並將使用者的手寫輸入橋接到底層的真實 Gemini 輸入框中。 |


## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes


## Privacy Policy

**Privacy Policy URL** [RECOMMENDED]
https://github.com/bruce1986/riddle-diary/blob/main/PRIVACY.md (建議上架前確保此連結可公開存取，或代換為 GitHub Pages 網址)


## Distribution

**Visibility**: Public
**Regions**: All regions
**Pricing**: Free


## Developer Info

**Publisher Name** [REQUIRED]
Bruce Jhang

**Contact Email** [REQUIRED]
8408455+Bruce1986@users.noreply.github.com

**Support URL / Email** [RECOMMENDED]
https://github.com/bruce1986/riddle-diary/issues


## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 0.3.1 | 2026-07-06 | 準備首次 Chrome Web Store 上架，調整 Manifest 與隱私政策宣告。 | Draft |
| 0.4.0 | 2026-07-07 | 加入 ChatGPT 與 Gemini 平台支援；一個擴充，三大 AI 平台同款日記體驗。 | Draft |


## Review Notes

### Known Issues / Limitations
- 由於此擴充功能高度依賴各平台的網頁 DOM 結構（Selectors），若 Claude.ai、ChatGPT 或 Gemini 進行前端架構大改版，本擴充功能的主題覆蓋可能會失效，需更新對應的 platforms/*.js 的 selectors。

### Rejection History
（尚無）
