# T4 多平台工作單：Claude + ChatGPT + Gemini

> Created: 2026-07-07
> Target: v0.4.0 首次 Chrome Web Store 上架（三站一次到位）
> Roadmap 根源：[project-handbook.md](project-handbook.md) T4
> 前置依賴：[TODO-rebrand.md](TODO-rebrand.md) + [TODO-i18n.md](TODO-i18n.md) 皆完成

## 為何一次到位

Bruce 決策：完整賣點「一個擴充 · 三大 AI · 同款魔法日記體驗」比先出 Claude 版更有辨識度。代價：三站 selector 都要人肉驗證、審查風險稍高、截圖工作三倍。

## 架構前提（T0 早已備好）

- `platforms/registry.cjs` 是 data-driven：新平台只要自我掛載到 `globalThis.RiddleDiary.platforms.<key>` 且宣告 `domains` 陣列，registry 就會自動比對 hostname
- `content.js` 只吃 `PLATFORM.selectors` 抽象介面——新平台補齊 selectors，覆蓋層邏輯不動
- `i18n.cjs` 已支援 bilingual persona，新平台的 persona 也走 `personaLocales: { zh_TW, en }` 同一機制

## 任務清單

### T4-A — 平台檔案 ✅ agent
新增 `platforms/chatgpt.cjs` 與 `platforms/gemini.cjs`，各自宣告 `domains`、`selectors`、`personaLocales`、`isOverlayPath`、`isExistingConversationPath`。Persona 沿用「墨水日記」通用魔法日記口吻（不特別客製給該平台，維持品牌一致）。

### T4-B — Manifest & 版號 ✅ agent
- `manifest.json` version 0.3.1 → **0.4.0**
- `content_scripts.matches` 加 `https://chatgpt.com/*`、`https://chat.openai.com/*`、`https://gemini.google.com/*`
- `content_scripts.js` 加 `platforms/chatgpt.cjs`、`platforms/gemini.cjs`（順序：registry → 全部平台 → i18n → content）
- `package.json` version 同步 0.4.0
- Chrome 對更多 host permission 會較嚴審——保留最小權限，只加這三個 origin

### T4-C — 文件同步 ✅ agent
- `README.md`（EN + zh）：功能區塊改為「Claude / ChatGPT / Gemini 三家皆可」
- `CHROMEWEBSTORE.md`（zh + en 雙語 listing）：Detailed Description、Single Purpose、Permissions Justification、Version History、Screenshot Notes 全面更新
- `project-handbook.md`：T4 標 ✅

### T4-D — 測試 ✅ agent
- 既有 `tests/platforms.test.cjs` schema 測試會自動涵蓋新平台
- 補 `tests/platforms.test.cjs` 或另檔：`isOverlayPath` / `isExistingConversationPath` 每平台 3–5 case
- `tests/manifest-load.test.cjs`：驗證新平台檔案有在 manifest 且按預期順序載入
- 全 suite 應仍 100% pass

### T4-E — Live selector 驗證 ⛔ Bruce（agent 無法代勞）
Agent 只能寫 **best-effort selectors + TODO 標註**（三站 SPA 前端變動頻繁，且沒有 live 存取權）。Bruce 需登入各站用 DevTools 逐一驗證：
- editor / sendButton / stopButton / assistantMessage / userMessage / historyItem
- 每壞掉一組 selector，該平台整組偽裝就瞎
- 建議先在 dev mode（Load unpacked）用真實登入號測，iterate to green

### T4-F — 商店截圖擴充 ⛔ Bruce
原本 3 張 → 建議 9 張（三站 × 書封/日記主畫面/歷史清單）。Chrome Web Store 允許 up to 5 screenshots — 挑最能秀「同款體驗跨三站」的 5 張。

### T4-G — CSS 覆蓋層 sanity check ⛔ Bruce
Claude UI 較深，overlay 疊得順；ChatGPT/Gemini 有 light/dark 兩套主題，overlay 是不透明羊皮紙背景理論上都蓋得住，但 z-index / iframe / modal 邊界要實測。

## 認領規則
同前工作單：不自動 commit、不 checkout branch、產出留在 working tree。

## 狀態圖例
⏳ 待開始 ｜ 🟡 進行中 ｜ ✅ 完成 ｜ ⛔ 待 Bruce 手動處理

---

## R8 深探 defer 項

> 以下項目在 Gemini grade fix-loop R8 深探中被標記為「需 T4-E live 瀏覽器驗證」，暫不修改程式碼，等 Bruce 以 DevTools 登入後確認。

1. **Boot-race dropping storage changes** (`content.js`): 在 `boot()` async gap 期間切換 `rd_enabled` 可能導致 overlay 狀態與 storage 不一致。需在 `bootComplete = true` 後補做 reconciliation。需謹慎的 state machine 審查。

2. **ChatGPT `isExistingConversationPath` regex tolerance**: 目前 regex 不接受非 hex 字元或結尾斜線。ChatGPT UUID 實際上可能只含 hex，如是則現有 regex 無誤——需 live URL pattern 確認後才能判斷是 bug 或 intentional。

3. **Gemini `isOverlayPath` completeness**: 可能漏掉 `/`、`/gems/*` 等路徑。需在 gemini.google.com live 環境探索所有真實路由後再確認是否需補充。

4. **Gemini Quill write path**: `content.js` 的 `execCommand("insertText")` 可能無法更新 Quill 的 internal Delta model，導致實際上沒有任何文字被送出。需 live 測試確認；若失效，需實作 Quill-specific 分支（如注入 Quill Delta API 呼叫）或暫停 Gemini write 支援。

5. **cleanText per-platform response prefix selectors**: F1 的修法使用 union regex（涵蓋 Claude/ChatGPT/Gemini/Assistant/Model）。更乾淨的設計是每個平台在 `selectors` 物件宣告自己的 `responsePrefixRegex`，讓 `cleanText` 動態使用。推遲到 T4-E 完成 live selector 驗證後再一起重構。
