# 墨水日記 · Ink Diary 開發協作手冊

## 專案身份

| 項目 | 說明 |
|------|------|
| **專案名稱** | 墨水日記 · Ink Diary |
| **在生態系統中的角色** | 一個 Chrome 擴充（MV3），把 Claude、ChatGPT、Gemini 三大 AI 對話介面偽裝成手寫魔法日記：使用者落筆 → 轉交給已登入的 AI → 回應以墨水浮現 |
| **開發優先順序** | 個人作品 / 興趣專案 |
| **目前階段** | 開發中（v0.4.0，支援三大平台；ChatGPT/Gemini selectors 待 live 驗證） |
| **架構說明** | [README.md](README.md) |
| **隱私說明** | [PRIVACY.md](PRIVACY.md) |
| **開發日誌 / 路線圖** | [TODO-20260619-1230.md](TODO-20260619-1230.md) |

> ⚠️ **此專案不做的事：**
> 1. 不蒐集、不傳送任何資料；不接後端或外部 API（`content.js` 刻意無 `fetch`/`XHR`/`WebSocket`）。
> 2. 不從 CDN 載入字型——字型一律本地打包，維持「零對外請求」。
> 3. 不修改使用者與 Claude 的對話內容本身，只做介面偽裝與輸入/輸出的轉送。

---

## 任務清單

> 目前的待辦與 backlog 以 [TODO-20260619-1230.md](TODO-20260619-1230.md) 為準，以下列出主要項目。

| 任務編號 | 說明 | 狀態 | 依賴 / 備註 |
|----------|------|------|-------------|
| T1 | 本地打包霞鶩文楷 TC 當辰宇落雁體後備，解決罕用字 fallback 變韓文 | ⏳ | 字檔大，可 subset |
| T2 | 墨水「沉入紙面再回字」電影級動畫 | ⏳ | |
| T3 | 翻頁 / 羽毛筆音效；書封皮革質感（`writeStrategy` / `features` 為 T3 reserved 欄位） | ⏳ | Gemini 的 Quill 寫入路徑尚未實作（`TODO(T4-E)`）；gemini.js 目前保留 `writeStrategy: "quill"` 讓 content.js 的 canary console.warn 能於 live 觸發，待 T4-E 實測後補 Quill-specific 分支或改回 "prosemirror" |
| T4 | 擴充到 ChatGPT / Gemini（各一組 SELECTORS + match） | ✅ | 平台檔、Manifest、文件、測試皆完成；live selector 驗證（T4-E）仍待 Bruce 以 DevTools 確認 |
| T5 | Tangerine 授權條款查證 | ⏳ | 見 `licenses/` |

**狀態圖例：** ⏳ 待開始 ｜ 🟡 進行中 ｜ 🔍 審核中 ｜ ✅ 完成 ｜ ⛔ 阻塞

---

## 開發流程

### 1. 開始一個任務

```bash
git checkout main && git pull
git checkout -b {{類型}}/{{編號}}-{{簡短說明}}
# 類型建議：feat / fix / docs / style / refactor / test / chore / design
```

### 2. 完成後發 PR

PR 標題格式：`[{{類型}}] {{說明}} (#{{編號}})`

PR 說明應包含：
- 做了什麼
- 對外介面是否有異動
- 如何驗證：`npm test` 應全數通過（platform schema / URL 路徑 / i18n）；另寫明手動驗證步驟：載入擴充、在 claude.ai / chatgpt.com / gemini.google.com 實測哪些情境，或記錄哪站待 live 驗證

### 3. Review

留言 `/Gemini review` 觸發 AI review，確認所有 comment 解決後合入。

直接 push 到 `main` 僅限文件小修正（typo 等級），功能性變更一律走 PR。

---

## 程式碼規範

- 命名有語意，函式名稱以動詞開頭
- 錯誤要處理，失敗路徑要有妥善處理（本專案多為 DOM 操作，注意 claude.ai / chatgpt.com / gemini.google.com 改版／context 失效）
- 不留死 code、不留 TODO 在 main 分支
- 維持「零對外請求」：不要引入任何 `fetch`/`XHR`/`WebSocket`/外部資源
- 頁面 DOM 選擇器集中在各平台設定檔 `platforms/<platform>.js` 的 `selectors` 物件（`content.js` 只吃抽象介面）

### PR Review 確認清單

- [ ] 已執行 `npm test` 並全數通過；若有平台邏輯或路徑變動，已補對應測試？
- [ ] 功能符合預期（已在 claude.ai / chatgpt.com / gemini.google.com 手動驗證，或記錄哪站待 live 驗證）？
- [ ] 命名清晰？
- [ ] 有無潛在 Bug（含 claude.ai / chatgpt.com / gemini.google.com 改版／IME／context 失效等邊界）？
- [ ] 是否維持零對外請求與最小權限？
- [ ] 文件（README / PRIVACY / TODO）是否同步？

---

## 工作日誌

> 每次 commit 前更新一次。記錄設計決策比記錄「做了什麼」更重要。
> （本專案的決策紀錄目前寫在 [TODO-20260619-1230.md](TODO-20260619-1230.md) 的「決策紀錄 Decision Log」。）

```markdown
## YYYY-MM-DD

### 完成
- 具體描述

### 問題 / 決策
- 說明選擇的原因，而非只說做了什麼
```
