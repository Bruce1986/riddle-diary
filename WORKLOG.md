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

#### R2 補充（同日）
- 事前預測落空（實際 1 high・3 medium）：**第三條 SPA 回歸**——導航離開對話頁（/chat/x → /settings）時 main 會把 overlay 加 rd-hidden 並 resetState，v0.4.0 重寫時同樣遺失，結果日記全螢幕蓋死設定頁、startIntro 還在上面跑動畫。已補回隱藏分支＋「自動隱藏（仍 enabled）回到對話頁自動重現」分支，保留翻回按鈕與 busy guard 語意。※ content.js 的 SPA 行為無單元測試覆蓋，此類修正屬 unvalidated-by-tests，合併前建議 live 手測三站換頁。
- README 權限表中英兩處補列 `web_accessible_resources: icons/*`（manifest 有宣告、content.js:239 翻回按鈕在用，表格卻宣稱「這就是全部」）。
- licenses/README.md 的 jf7000 開放疑問與 TODO-chromewebstore-launch §S4 的「已排除」結論矛盾——已依 S4 結論更新（jf7000 為字集規格，CC BY-SA 只管規格文件，字型本體 OFL 1.1）。

#### R3+R4 補充（2026-07-12）——根因確立：merge 49e8bb8 用 `--ours` 輾掉 main 的加固
v0.4.0 分支開發早於 main 上多輪 review 加固；合併時以 `--ours` 解衝突、誤以為「HEAD 是 main 的自然超集」，把 main 中有理由註解的保護整批清掉。本兩輪以 origin/main 為對照逐條驗證後補回 **16 條**（多數帶回 main 原註解）：
- **R3（6 條）**：停用路徑（popup toggle／闔上鈕）resetState 後未重啟 URL 監看＋stale 翻回鈕可把 overlay 蓋到非對話頁（補 onOverlayPath guard ×3 與 watchUrlChanges 重啟 ×2）；sendToClaude insertText 失敗恢復 fail-fast（不再合成 beforeinput 假成功）＋startTurn 失敗同步重置 busy/佇列＋no_editor 競態修正；startIntro 補回 lastRenderedNodes staleness 檢查；載入輪詢 24→50 tries、逾時改明確 load_fail 訊息（新增 i18n key）；outermost() 去巢狀（responseNodes/renderExisting）；openBook 防連點（openBookTimer 進 resetState）。
- **R4（10 條，Opus tracer 驗證全數成立）**：watchResponse 兩處逾時補回 `!streaming`（思考型模型 66 秒被誤判、長生成 2 分鐘被腰斬）；diary.css 補回 `.rd-line{white-space:pre-wrap}`（多段落/列表被擠成一行——merge 在 css 唯一輾掉的規則）；窺視鈕整組防護（opacity+pointer-events、右鍵 guard、window blur 還原、鍵盤支援）；submit 先驗 editor 再清輸入框（不吞字）；buildOverlay/injectFonts 清擴充重載殘留（防雙層 overlay）；trackIfStreaming 整函式移植（串流中載入的對話完成後重渲染）；finish 後 pen.focus()（防輸入打進底層編輯器）；selectAll → Selection API（防誤選整頁）；歷史標題去重 regex 恢復 \s+（「哈哈哈哈」不誤切）；ink 分批浮現＋動畫後合併 span、cleanText WeakMap 快取（效能）。
- 新增 i18n key：insert_fail、load_fail（zh_TW/en 同步，字典 30 keys）。文件行數描述改為抗漂移寫法（以 wc -l 為準）。
- 驗證：123 測試全過、lint 綠。※ content.js 的 SPA/DOM 行為無單元測試，本兩輪 16 條移植均屬 unvalidated-by-tests——**merge 前務必三站 live 手測**（換頁、首訊轉址、闔上/翻回、窺視、長回覆、串流中載入）。
#### R5+R6 補充（2026-07-12）
- R5：翻回鈕 #rd-reopen 補「擴充重載殘留清理」（同 #rd-overlay/#rd-fontface 第三例，改用模組變數區分本世代）；TODO 維護備忘 .cjs→.js ×3＋selectors 大小寫＋功能 2 完成式；WORKLOG 簡體「竞态」勘誤為「競態」。
- R6：Claude 綜合審查 clean；Codex 交叉查核抓到**跨輪移植接縫**——r3 移植 staleness 檢查但 main 配套的 lastRenderedNodes 生命週期（四站點）沒跟上：同一對話闔上→翻回會被誤判 stale 空白等 ~15s。已補齊：watcher 離開對話頁清空、resetState 停用時清（含刻意不在 chat→chat 清的 Gemini-review 註解）、re-enable/翻回立即清、close 鈕同步設 state.enabled=false。教訓＝成套機制要一次移植完整生命週期，不能只搬用到的那半。

#### R8 補充（2026-07-12）
- Opus tracer 抓到 .cjs 殘留的**原始碼註解**版（四輪 doc sweep 都只掃 .md）：content.js 載入順序註解（:6-9）與 registry.js 自我描述（:1-4）共 6 處已改 .js。MV3 會拒載 .cjs content script，照舊註解加平台檔會重蹈 09be4b8 的無聲失效。
- Codex 重提 cleanText in-memory 走訪（見下方定案備忘，維持不採用）。

#### 定案備忘：cleanText 不移植 main 的 in-memory 走訪（R4 定案、R8 Codex 重提，維持不採用）
main 的純記憶體走訪（避免 innerText 強制 layout）只在 claude.ai（單平台）live 驗證過；v0.4.0 要吃三平台的未知 DOM 結構，innerText-on-pre-wrap 的文字抽取語意較保險。已以 WeakMap 快取把重複呼叫成本壓到每節點一次；renderExisting 首次載入的 per-message 強制 layout 屬一次性成本。效能優化（含 in-memory 走訪移植）留待 T4-E live QA 有實測數據再決定——屆時請一併驗證換行/空白抽取在三平台的等價性。

- 校準記錄：R3 事前預測「≤1 medium、0 high」落空（實際 R3 6 條、R4 10 條）——低估了 `--ours` merge 的系統性影響；教訓＝發現一條「重寫遺失」時要立刻假設同類還有一批，先做全量對照掃描再預測。
