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
2. `no-irregular-whitespace: "off"`：content.js 第 433 行 `replace(/ /g, " ")` 的 regex 裡含 U+00A0 NBSP，這是業務邏輯（把不換行空格換成一般空格），不能改動。

### 2026-06-21 — Gemini PR #2 review 回應
- 測試清理改用 node:test 原生 `after()` hook（取代假的清理 `it`，前面測試失敗也保證清理）。
- `registry.selectPlatform` 開頭加 `typeof hostname !== "string"` 防禦，並補非字串（null/undefined/number）回傳 null 的測試。
- `content.js` 取 PLATFORM 時改用 `typeof selectPlatform === "function"` 嚴格檢查。
- 測試數維持 30 個全過，lint 綠。

### 2026-06-21 — Gemini PR #2 review r2
- `@eslint/js` 顯式加入 devDependencies（eslint.config.js 有 import，避免 pnpm/Yarn PnP 嚴格解析失敗）。
- 平台網域比對改為資料驅動：各平台設定宣告 `domains` 陣列，`registry.selectPlatform` 動態走訪比對（完全相等或子網域）。日後新增 ChatGPT/Gemini 平台不必再改 `registry.cjs`，呼應 DEVPLAN「各平台只動自己的設定檔」。
- 補 `domains` schema 測試；測試數 31 個全過。
