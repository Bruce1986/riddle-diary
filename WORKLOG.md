# WORKLOG

## 2026-07-17 — PR#2 合併後 worktree 稽核：補回四項遺落加固

PR #2 合併後清理本機時，發現兩個 fix-loop 舊 worktree 有未提交改動；逐項與 main 比對後，兩項已被後續輪次以不同解法涵蓋（SPA 自轉場改用 `wasNonConvo && busy` 判斷、lint:fix 遮蔽改 package.json 改名 `fix`），四項真的遺落，本分支補回：

1. **重載既有對話剝除隱藏人設前綴**：送出時前置的人設指令被平台原樣存下，重載後會像使用者親寫。適配 personaLocales 架構——比對「本平台所有語系」（對話建立後可能已切換語言），正規化（nbsp、trim）與 cleanText 輸出一致。
2. **trackIfStreaming 換頁競態守門**：記住 `trackedPath`，400ms 追蹤輪詢在 700ms url 監看察覺換頁前若讀到新對話 live DOM，自我取消不渲染。
3. **歷史標題 ReDoS 防護**：去重 regex `/^(.{2,}?)\s+\1$/` 對週期性＋多空白切點標題近二次方回溯（30 萬字實測破秒）；去重前先 200 字上限（標題本就截 40 字，不影響顯示）。
4. **CI 供應鏈防禦**：`permissions: contents: read` 最小權限＋actions 以 commit SHA 釘選（SHA 經 gh api 對官方 v4 tag 重新驗證）。

測試 164 全過（+4：雙語系剝除、競態時間軸、ReDoS 計時門檻）；突變驗證 37/37 killed（+3 條登錄）。

### 2026-08-09 — 本機 Gemini-grade review 收斂（PR #4）

推 PR 前依 `.gemini/styleguide.md` 逐條自審，四項加固的**行為不變**，收斂如下：

- **門檻常數化**（§2 不要硬編碼）：歷史標題的 `200` / `40` 抽成
  `HISTORY_TITLE_SCAN_MAX` / `HISTORY_TITLE_MAX`，去重 regex 抽成 `DUP_TITLE_RE`，
  並在宣告處註明 `SCAN_MAX >= MAX` 的不變式。
- **型別防禦去重複**（§1 DRY、§5 型別防禦）：`personaLocales` 的物件檢查抽成
  `personaLocaleMap()`，`getPersona()` 與 `PERSONA_PREFIXES` 共用同一份判斷；
  候選清單改為只收字串、去重（`persona` 後備字串多半就等於 `personaLocales.zh_TW`）
  並由長到短排序，避免日後某語系人設恰為另一語系前綴時短者先命中而留下殘字。
- **SHA pin 註解寫確切版本**（§8 供應鏈）：`# v4` 改為 `# v4.3.1`（checkout）與
  `# v4.4.0`（setup-node）。兩個 SHA 以 `git ls-remote --tags` 對官方 repo 重新核對
  屬實；浮動的 `v4` 註解看不出實際釘在哪一版，Dependabot / Renovate 也靠它判斷升版。
- **計時斷言去 flake**（§9 測試）：ReDoS 測試改用 `process.hrtime.bigint()` 單調時鐘，
  門檻由 150ms 放寬到 500ms。實測未設上限時 15 萬字 ~470ms、30 萬字 ~1.9s，
  設上限後 ~0.03ms；500ms 距退化仍有約 4 倍餘裕，又不會因 CI 負載/GC 抖動偽紅。
- 同步更新 `scripts/mutation-check.js` 兩條受重構影響的 `find` 字串（長度上限、去重 regex）。

驗證：lint 綠、`npm test` 164/164、`npm run test:mutation` 37/37 killed。

**待辦（不在本 PR scope）**：CI 只跑 lint + test，不跑 `test:mutation`，
突變登錄的 `find` 字串會隨重構默默失效（本輪就實際發生過一次）。可另開 PR 加 CI job。

### 2026-08-09 — Gemini review 第二輪：挖出 cleanText 的 NBSP 正規化早已失效

Gemini 建議把 `PERSONA_PREFIXES` 那行的字面 NBSP 改成 ` ` 逸出序列。查證時發現
`cleanText` 的同款寫法 `(clone.innerText || "").replace(/ /g, " ")` **兩側都是一般空白
U+0020**——在 `main` 上就已經是 space→space 的 no-op，字面 NBSP 想必在某次編輯中被
悄悄換成一般空白（兩者在編輯器裡長得一模一樣，這正是 Gemini 那條建議的價值所在）。

後果不是理論問題：對話平台常把空白序列化成 `&nbsp;`，此時 `cleanText` 留著 NBSP、
而 `PERSONA_PREFIXES` 已把 NBSP 正規化成一般空白，`startsWith` 對不上 →
隱藏人設指令整段外洩到日記，正是本 PR 第 1 項要修的東西。已用逸出序列修回，
並補一個「NBSP 版人設前綴」測試把兩邊的正規化綁在一起（突變登錄同步 +1 條）。

同輪一併處理：

- `.replace(/^\s+/, "")` → `trimStart()`（Gemini medium；MV3 原生支援）。
- **標題截斷不切碎代理對**（承接 7/20 尚未處理的那條 review）：新增
  `sliceKeepingSurrogates()`，掃描上限與顯示上限兩處截斷都改走它。未採用建議的
  `Array.from(...).slice(...)`——那會先把整串展開成陣列，對超長標題（正是這裡要防的
  攻擊面）多付一次 O(n)，與長度上限初衷相斥；改為切完檢查尾字是否為 high surrogate，O(1)。

驗證：lint 綠、`npm test` 166/166、`npm run test:mutation` 39/39 killed。

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

#### 收斂（2026-07-12）
R9-R13：r10/r11 僅剩 TODO 檔 .cjs 殘留與標註格式 nit（已修、該類別做過機械式全量封閉）；R12 Opus tracer（三條高風險 flow 端到端追蹤）與 R13 最終關卡連續兩輪 clean → **fix-loop 收斂**。共 13 輪、61 條 finding 全數處理（3 high 類：CI lint gate、SPA 首訊回應遺失、store 文案無 hedge；主體為 --ours merge 輾掉的 21 條 main 加固回歸）。123 測試全過、lint 綠、打包 zip 乾淨。**Merge 前必做**：三站 live 手測（換頁、首訊轉址、闔上/翻回、窺視、長回覆、串流中載入）。（收斂後已補 jsdom 單元測試與突變驗證，見文末「測試補課」；live 手測閘門不變。）

#### 定案備忘：cleanText 不移植 main 的 in-memory 走訪（R4 定案、R8 Codex 重提，維持不採用）
main 的純記憶體走訪（避免 innerText 強制 layout）只在 claude.ai（單平台）live 驗證過；v0.4.0 要吃三平台的未知 DOM 結構，innerText-on-pre-wrap 的文字抽取語意較保險。已以 WeakMap 快取把重複呼叫成本壓到每節點一次；renderExisting 首次載入的 per-message 強制 layout 屬一次性成本。效能優化（含 in-memory 走訪移植）留待 T4-E live QA 有實測數據再決定——屆時請一併驗證換行/空白抽取在三平台的等價性。

- 校準記錄：R3 事前預測「≤1 medium、0 high」落空（實際 R3 6 條、R4 10 條）——低估了 `--ours` merge 的系統性影響；教訓＝發現一條「重寫遺失」時要立刻假設同類還有一批，先做全量對照掃描再預測。

#### 測試補課（2026-07-12，Bruce 指示）：SPA/DOM 行為單元測試＋突變驗證
- 新增 `tests/helpers/content-harness.js`：jsdom（devDependency）＋ vm 依 manifest 順序載入全部 content script、假時鐘（tick 決定性推進，不 sleep）、chrome.* 同步 stub、claude.ai DOM 夾具——每測試全新隔離環境。
- 新增 `tests/content-spa.test.js` 的行為測試（條數以 `npm test` 輸出為準）：啟動/監看、SPA 換頁（含首訊轉址 busy 保護、hide-on-leave、自動重現、翻回按鈕跟路由、stale 按鈕防護、翻回/重新啟用後監看重啟）、闔上→翻回 staleness 生命週期、慢載容忍與載入逾時、fail-fast/吞字保護/!streaming 逾時×2/焦點搶回、outermost 去巢狀、多段落換行、ink 動畫後 span 合併、佇列 flush、persona 前置、開書防連點、重載殘留清理×2、窺視鈕防護、歷史清單（去重砍半/哈哈哈哈不誤切/截斷/軟導航重查錨點/fallback 守門）、IME 組字與 Shift+Enter 守門、死送 120 拍逾時、trackIfStreaming 載入中串流補渲染、popup 開關與語言切換。
- 新增 `scripts/mutation-check.js`（`npm run test:mutation`）：目標式突變逐一把 fix-loop 補回的保護改壞、確認測試轉紅，**全數 killed**（條數以腳本輸出為準——先前兩度在本檔手寫數字造成 off-by-one，改為不重複數字）。過程發現兩處 lastRenderedNodes 顯式 clear 與 resetState 條件 clear 互為雙保險（單行突變倖存＝冗餘防禦、非漏洞），改以複合突變驗整組機制，並補列 watcher 離開對話頁 clear（獨立承重）之突變。
- 初版測試曾有三個送出類測試靠「boot introPoll 尚未收攤」的非預期路徑通過——已改為先完成初始渲染再進使用者回合（突變驗證就是為了抓這種假綠）。
- GEMINI.md「DOM 橋接無法被單元測試覆蓋」聲明同步更新。**jsdom ≠ 真站**：merge 前三站 live 手測仍必要（清單見上方收斂註記）。
- **測試工程自身的 gemini-grade fix-loop（2026-07-12，11 輪收斂）**：Codex＋多代理審測試工程本身，共 22 條 finding 全處理。除首輪 8 條外的重點：翻回/重新啟用後監看重啟零覆蓋（審查者實測拔掉兩條重啟呼叫全綠才立案，補測試＋複合突變）；R2 新測試被 close self-echo 干擾成假綠（tick 讓 echo 先落地）；歷史清單整塊零覆蓋（含 \s+ 去重 regex 實測倖存，補測試×3＋突變×2）；Opus tracer 獵出 IME 組字/Shift+Enter 守門、死送 120 拍逾時、trackIfStreaming、語言切換四塊缺口（全部雙向實證後補齊）；scripts/ 漏進上架 zip（打包排除補上）；scripts/ 不在 eslint glob 內（lint 對其完全不作用，實測注入違規照綠——「lint gate 設定疏漏」同類再現，已納入並紅檢）。教訓：把 stub 修得更像真實環境（self-echo）會讓部分突變「復活」——那是揭露真實世界的雙保險，照例改複合突變驗機制。最終：160 測試全綠、34/34 突變 killed、打包乾淨、R10+R11 連續兩輪 clean＋Codex 兩度交叉皆淨。
- **審後補強（本段完成後又跑了一輪 gemini-grade fix-loop，8 條 finding 全修）**：mutation 腳本補「綠色基準」前置檢查（套件本來就紅時每隻突變都假 killed——Codex 抓到）＋例外/SIGINT/SIGTERM 還原保證（實測 Ctrl-C 會把突變留在工作樹）；harness 的 innerText polyfill 從 textContent 純別名升級為區塊元素換行語意（否則 cleanText 改壞成 textContent、多段落黏成一行也測不出——已加多段落測試＋對應突變）；假時鐘加 10 萬次迭代上限（防 0ms 遞迴計時器讓 CI 無聲卡死）；chrome stub 的 set() 補真 Chrome 的 self-echo 語意（0ms 假時鐘送達，開闔測試自然演練 onChanged 冪等性）；補佇列 flush 與 persona 前置測試（原本零覆蓋、後者因 stub 丟參數而結構性不可測——已改為捕捉插入文字）。

