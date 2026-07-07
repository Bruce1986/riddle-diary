# Rebrand 工作單：Riddle Diary → 墨水日記 · Ink Diary

> Created: 2026-07-07
> 動機：避免 Warner Bros 商標風險 + Chrome Web Store impersonation 政策風險。原免責聲明不足以覆蓋直接使用「Tom Riddle」商標字面。
> 依賴關係：此 rebrand **先於** [TODO-chromewebstore-launch.md](TODO-chromewebstore-launch.md) 的 S1（圖示）與 S2（截圖），且會反覆刷 S5（打包）。

## 決策定案

| 項目 | 舊 | 新 |
|---|---|---|
| 擴充中文名 | 湯姆瑞斗的日記本 | **墨水日記** |
| 擴充英文名 | Riddle Diary | **Ink Diary** |
| 完整品牌串 | Riddle Diary ｜ 湯姆瑞斗的日記本 | **墨水日記 · Ink Diary** |
| 書封上字樣 | T. M. Riddle | 「墨水日記」或 "INK DIARY"（agent 挑一致視覺） |
| 描述文引用 | 「《哈利波特》中湯姆瑞斗的日記本」 | 「靈感來自魔法奇幻文學的手寫日記」等泛用描述 |
| 人設 PERSONA | Tom Riddle 角色扮演提示 | 通用「會回話的魔法日記本」，去除 HP 專有名詞 |
| 圖示上字樣 | T. M. RIDDLE | 拿掉，改為「墨」書法字 monogram（或 agent 判斷更佳者） |

## 不改的東西（保留）

- 核心體驗：墨水浮現、書封翻開、書籤歷史、皮革羊皮紙美學
- 內部程式碼識別（`globalThis.RiddleDiary`、`platforms/claude.cjs` 檔名、資料夾 `riddle-diary/`）——這是 code identifier，非使用者可見
- Repo 名 `bruce1986/riddle-diary`——改動牽涉 GitHub URL、PRIVACY_URL 等連鎖，另案決定
- 字型（Tangerine + 辰宇落雁體）——OFL 相容，跟 rebrand 無關
- 歷史文件 `WORKLOG.md`、`TODO-20260619-1230.md`——過去決策紀錄，不改寫歷史

## 任務清單

### R1 — 程式碼與 config 字串 rebrand ✅ agent（Sonnet, 2026-07-07）
**Scope**：`manifest.json`、`content.js`、`platforms/claude.cjs`、`popup.html`、`popup.js`、`diary.css`
**要改**：擴充名稱、書封標題、popup 內 checkbox 標籤（原「湯姆瑞斗人設」→ 例如「魔法日記人設」）、PERSONA 提示詞（改為通用魔法日記口吻，去 HP 專有名詞）
**驗收**：`grep -i "riddle\|湯姆\|瑞斗\|哈利波特\|harry potter"` 在上述檔案清空（`globalThis.RiddleDiary` 內部識別除外）

### R2 — 文件 rebrand ✅ agent（Sonnet, 2026-07-07）+ manifest 描述由 Bruce 手動微調 + package.json 描述由主機補
**Scope**：`README.md`（EN + zh 兩區）、`CHROMEWEBSTORE.md`（store listing 全文）、`project-handbook.md`、`PRIVACY.md`（審視即可）
**要改**：專案名、描述、Store Listing 的 Extension Name / Short Description / Detailed Description / Single Purpose / Screenshot Notes；免責聲明可保留但不再點名 WB / 哈利波特
**驗收**：`grep -i "riddle\|湯姆\|瑞斗\|哈利波特\|harry potter\|warner"` 在上述檔案清空；README 前後語氣連貫

### R3 — 圖示重繪 ✅ agent（Sonnet, 2026-07-07）：128/48 為金色書法「墨」+ 金框，16 為 ink drop 金色墨滴（墨字太密）
**Scope**：`icons/icon.svg`、`icons/icon-16.svg`、`icons/icon-16.png`、`icons/icon-48.png`、`icons/icon-128.png`
**設計方向**：保留深棕皮革（`#3a2215` → `#130b04`）+ 金框視覺，把中央文字「T. M. RIDDLE」換成 **金色書法「墨」字** 為主 mark；16px 版可維持「墨」（因字型筆畫辨識高）或簡化為墨滴/羽毛符號，agent 判斷。
**驗收**：3 個 PNG 尺寸正確、無「Riddle」字樣

### R4 — 完成後打包重跑 ✅（2026-07-07）
`riddle-diary-v0.3.1.zip` = 2.9MB / 25 檔，新品牌與新圖示都在，商標字面消失。ZIP 檔名仍是 `riddle-diary-*.zip`（受 R5 綁定）。

### R5 — Repo 改名決定 ⏳ Bruce（另案）
是否 `bruce1986/riddle-diary` → `bruce1986/ink-diary`？影響 `PRIVACY.md` URL、本地 remote、GitHub redirect。可以之後另議。

## 認領規則
同 [TODO-chromewebstore-launch.md](TODO-chromewebstore-launch.md)：不自動 commit、不 checkout branch、產出留在 working tree。
