# i18n 工作單：中英文自動 / 手動切換

> Created: 2026-07-07
> 動機：擴充要同時服務中英文使用者，且能被使用者手動覆蓋語言。搭配 rebrand 後的中性品牌一起送審。
> 依賴：Rebrand 完成後 (見 [TODO-rebrand.md](TODO-rebrand.md))。

## 設計原則

1. **Manifest 品牌串**保持雙語硬編碼「墨水日記 · Ink Diary」——manifest name/description 不支援 runtime 切換，雙語呈現對雙邊使用者都友善。
2. **In-page UI + Popup**：runtime i18n，讀 storage 中的使用者偏好，fallback 到 `chrome.i18n.getUILanguage()`。
3. **PERSONA**（注入 Claude 的角色提示）：中英文各一份，依當前語言選擇。
4. **CWS Listing**：Chrome Web Store 支援多語 listing，`CHROMEWEBSTORE.md` 需擴充為 zh_TW + en 兩區。
5. 三個語言選項：**自動 (auto)**、**繁體中文 (zh_TW)**、**English (en)**。預設 auto。

## 任務清單

### I1 — 圖示改「INK」✅ agent（Sonnet, 2026-07-07，經 4-variant shotgun 選 V4）
128 用 **Tangerine 花體 "Ink"**（專案內建，配上金框深棕皮革）；48 由 128 Lanczos 降採樣（保留雙框與角落鑽石飾）；16 因 Tangerine 花體在 16px 完全糊掉 → fallback 金色墨滴 silhouette（同 R3 iteration 選項）。過程檔案 `icons/preview/` 已清掉。
把 R3 產出的「墨」書法 mark 換成金色襯線「INK」（Baskerville / Trajan 感），維持深棕皮革 + 金框。128 / 48 / 16 三尺寸；16px 若「INK」三字母渲染太糊，允許降級為墨滴或單字母 "I" 圖徽。

### I2 — i18n 基礎設施 + 全面 refactor ✅ agent（Sonnet, 2026-07-07）
新增 `i18n/messages.js`（雙語字典 30 keys；後續功能陸續加 key）+ `i18n/i18n.js`（`resolveLocale` / `getMessage` / `initLocale` / `setLocale`）。`content.js` 全面走 `t(key)` + `data-i18n` attrs；`popup.html` 加 3-radio 語言選單；`storage.onChanged` listener 讓 in-page 即時切換。PERSONA 拆成雙語 object 由 locale 決定。
建 `i18n/` 目錄含 messages dictionary + helper；重構 `content.js`、`popup.html`、`popup.js`、`platforms/claude.js`（時名 .cjs）的所有使用者可見字串走 `getMessage()`；PERSONA 拆成雙語 object；popup 加語言選單（3 radio buttons）；wire up `chrome.storage.sync` 儲存偏好 + `chrome.storage.onChanged` 讓 content.js 即時更新。

### I3 — CHROMEWEBSTORE.md 英文版 store listing ✅（含在 I2）
`CHROMEWEBSTORE.md` 新增 "## English Locale (en)" 區塊：Extension Name / Short Description (≤132) / Detailed Description / Single Purpose。

### I4 — 測試 ✅（含在 I2）
新增 `tests/i18n.test.js`（時名 .cjs） 17 個測試（`resolveLocale` 邊界、字典 key parity、`getMessage`）；連同原本 37 個 → 54 tests 全過。

### I5 — 目測驗收 ⏳ Bruce
- Chrome 載入未封裝擴充，切三種語言選項，確認 in-page + popup 都跟著變
- 目測「INK」圖示

## 認領規則
同 rebrand 工作單：不自動 commit、不 checkout branch、產出留在 working tree。
