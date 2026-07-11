# WORKLOG

## 2026-06-20 — T0：解耦平台設定 + 立起 CI

### 做了什麼
把 `content.js` 裡寫死的 claude.ai 平台相關常數（SELECTORS、PERSONA、onOverlayPath 邏輯、isExistingConversationPath 邏輯）抽成 `platforms/claude.cjs`，並建立 `platforms/registry.cjs` 依 hostname 選取平台設定。同步建立 `package.json`、`eslint.config.js`（ESLint v9 flat config）、`tests/platforms.test.cjs`（node:test 30 個測試全過）。

### 關鍵決策：為何用 UMD 而非裸 ES export

content.js 由 manifest MV3 `content_scripts.js` 陣列以**傳統 script**（非 ES module）載入到瀏覽器頁面：若在 platforms/*.js 使用裸 `export`，Chrome 會報 `Unexpected token 'export'`，擴充完全失效。

本專案 T0 沒有打包步驟（Webpack/Rollup/esbuild 留給 T4），因此平台檔必須能「雙棲」：
- **瀏覽器**：由 manifest 依序注入，掛全域 `globalThis.RiddleDiary`
- **Node.js 測試**：以 `require()` 載入，透過 `module.exports` 回傳物件

UMD 包裝（`if (typeof module !== "undefined" && module.exports) module.exports = ...`）可同時滿足兩種載入，不需任何構建工具。

副檔名改為 `.cjs` 的原因：`package.json` 設了 `"type": "module"`（為了 eslint.config.js 能用 ES import 語法），在此環境下 `.js` 副檔名的檔案被 Node 當成 ESM 執行，導致 `module.exports` 失效。`.cjs` 副檔名強制 Node 以 CommonJS 執行，瀏覽器不受影響（Chrome 只看 manifest 路徑，忽略副檔名語意）。

### 放寬的 ESLint 規則（均有理由，不影響行為）
1. `no-unused-vars: { caughtErrors: "none" }`：content.js 有大量 `catch (e)` 靜默忽略例外（擴充 context 失效時的降級策略），這是刻意設計，不應報錯。
2. `no-irregular-whitespace: "off"`：content.js 的 `cleanText` 函式裡 `replace(/ /g, " ")` 的 regex 含 U+00A0 NBSP，這是業務邏輯（把不換行空格換成一般空格），不能改動。

### 2026-06-21 — Gemini PR #2 review 回應
- 測試清理改用 node:test 原生 `after()` hook（取代假的清理 `it`，前面測試失敗也保證清理）。
- `registry.selectPlatform` 開頭加 `typeof hostname !== "string"` 防禦，並補非字串（null/undefined/number）回傳 null 的測試。
- `content.js` 取 PLATFORM 時改用 `typeof selectPlatform === "function"` 嚴格檢查。
- 測試數維持 30 個全過，lint 綠。

### 2026-06-21 — Gemini PR #2 review r2
- `@eslint/js` 顯式加入 devDependencies（eslint.config.js 有 import，避免 pnpm/Yarn PnP 嚴格解析失敗）。
- 平台網域比對改為資料驅動：各平台設定宣告 `domains` 陣列，`registry.selectPlatform` 動態走訪比對（完全相等或子網域）。日後新增 ChatGPT/Gemini 平台不必再改 `registry.cjs`，呼應 DEVPLAN「各平台只動自己的設定檔」。
- 補 `domains` schema 測試；測試數 31 個全過。

### 2026-07-09 — v0.4.0：rebrand + i18n + 多平台（T4）
- 品牌改為「墨水日記（Ink Diary）」；新增 i18n（zh_TW/en 字典、in-page 即時切換、popup 語言選單）；平台擴充 ChatGPT（chatgpt.com / chat.openai.com）與 Gemini（gemini.google.com），selectors／路徑判斷各自集中於 platforms/*；新增上架文案 CHROMEWEBSTORE.md 與打包腳本 package-extension.sh。
- ChatGPT／Gemini 的 live selector 驗證與 Gemini Quill 寫入路徑留在 T4-E（⛔ 待辦）；writeStrategy／features 仍為預留欄位（content.js 未接線），見 TODO-t4-multiplatform.md R8 defer 清單。

### 2026-07-09 — fix(mv3)：content script 副檔名 .cjs → .js（09be4b8）
- Chrome MV3 拒載 .cjs 副檔名的 content script——推翻本檔 T0 段「Chrome 只看 manifest 路徑，忽略副檔名語意」的假設（勘誤）。全部平台／i18n／測試檔 git mv 改 .js；package.json 移除 "type": "module" 讓 .js 回 CJS；eslint.config.js → eslint.config.mjs（副檔名強制 ESM，與 package.json 解耦）。
- 當時漏更新 GEMINI.md／CHROMEWEBSTORE.md／TODO-i18n.md 內的 .cjs 路徑（2026-07-12 fix-loop 已校正）。

### 2026-07-12 — PR #2（v0.4.0）最後掃描 fix-loop（Claude 深審 + Codex 交叉審）
審查規模：Codex + 4 個獨立審查代理 + 對抗式驗證；19 條候選 → 17 條確認（3 high）、2 條打掉（Gemini quill 寫入與 features.history 未接線＝已文件化的 T4-E 定案延後，不重審）。修正如下：
- **SPA 導航回歸 ×2（Codex 發現、對 main 實碼驗證）**：(1) 首訊送出後 / 或 /new 或 /app → 對話路徑的轉址，busy 中不再被無條件重置（v0.4.0 重寫時遺失 main 的保護，第一則回應會凍成靜態快照）；(2) boot() 恢復無條件啟動 watchUrlChanges，初載於 /settings 等非 overlay 路由後導回對話頁可補建 overlay（同樣是重寫時遺失），並保留翻回按鈕語意。
- **CI lint gate**：package.json 的 lint:fix 改名 fix——ci.yml 會在 lint 前跑 `npm run lint:fix --if-present`，原名使 auto-fixable 違規在 CI 永遠綠（實證重現 ×2）；改名後該步驟 no-op。
- **manifest-load.test.js 改讀真正的 manifest.json**：斷言 content.js 最後、platforms/ 每檔與 i18n 檔都列入且存在、依宣告順序載入後三平台 selectPlatform 可用（舊版硬編 require 順序守不到 manifest 漂移）。
- **選擇器鍵同步測試**：REQUIRED_SELECTOR_KEYS 提為模組常數＋「content.js 實際消費的 SELECTORS.<key> ⊆ 清單」測試（runtime 守衛唯一委派的防線）。
- **registry 防禦分支補測**：仿冒後綴（evilclaude.ai／notclaude.ai／evilchatgpt.com → null；退化裸 endsWith 會紅）與畸形平台 skip（domains 字串／[""]／undefined 不誤配不丟例外）。
- **打包洩漏**：package-extension.sh 補 -x ".git"——worktree 的 .git 是指標檔非目錄，原樣式擋不到，實測 zip 會夾帶本機絕對路徑。
- **lockfile 版本**：npm install 重生 package-lock.json 的 0.3.1 → 0.4.0 殘留欄位。
- **文件同步**：09be4b8 漏改的 .cjs 路徑（GEMINI／CHROMEWEBSTORE／TODO-i18n）；GEMINI.md 改指各平台檔的 selectors；README／PRIVACY 行數 730 → 830、驗證 grep 與 less 涵蓋 platforms/ i18n/；TODO-i18n key 數 20 → 28；TODO-chromewebstore-launch 目標改 v0.4.0 並加 T4-E 閘門；CHROMEWEBSTORE 支援平台段補「ChatGPT／Gemini 仍在實測驗證」中英 caveat（對外文案原本是唯一沒 hedge 的地方）；gemini.js features 註解改為如實描述「尚未接線」。
驗證：123 個測試全過、lint 綠；新測試均紅過一次（manifest 打亂→紅、content.js 消費未列鍵→紅、registry 退化裸 endsWith→紅）；打包 zip 復驗零 .git 條目。
事前預測：後續審查輪 ≤1 條 medium、0 high（信心六成）。
