# Chrome Web Store 上架工作單

> Created: 2026-07-07
> Target: v0.3.1 首次上架審查
> 主 spec: [CHROMEWEBSTORE.md](CHROMEWEBSTORE.md)
> Roadmap: [TODO-20260619-1230.md](TODO-20260619-1230.md)

## 認領規則

- **⏳ agent**：Sonnet subagent 可獨立完成，Bruce 事後 review。
- **👤 Bruce**：需要 claude.ai 登入 / 手動 QA / 藝術品味決策。
- 產出**不自動 commit / 不 checkout 新分支**：全部留在 working tree，Bruce 統一決定分支與合入策略。
- 認領時 ⏳ → 🟡（進行中）+ 姓名；完成 ✅。

## 任務清單

### S1 — 皮革日記本圖示 16/48/128 ✅ agent（Sonnet, 2026-07-07）
**產出**：`icons/icon.svg`（128×128 source）、`icons/icon-16.svg`（16px 簡化版 source）、`icons/icon-{16,48,128}.png`
**設計摘要**：深棕皮革（`#3a2215` → `#130b04` radial gradient）+ 金框 + 金色 Baskerville 襯線字「T. M.」/「RIDDLE」+ 左側書脊帶；16px 版簡化為單字母「R」monogram（Baskerville Bold 42pt → downsampled Lanczos）。用 ImageMagick 7.1.2 rasterize，text 由 draw 指令繪出以繞開 SVG fontconfig 限制。
**下一步**：Bruce 目測 review 三個尺寸；不喜歡就退回 agent 重做。

### S2 — 商店截圖 3 張（1280×800）⏳ 👤 Bruce
**產出**：`screenshots/{cover,diary,history}.png`
**構圖**：書封頁 / 手寫日記主介面 / 左側歷史章節（詳見 CHROMEWEBSTORE.md § Screenshot Notes）
**工具建議**：`/gstack` 或手動載入擴充後截圖。

### S3 — Privacy Policy URL 驗證 ✅ agent（Sonnet, 2026-07-07）→ ⛔ blocked
**結果**：repo `bruce1986/riddle-diary` 是 public、default branch = `main`，但 **`PRIVACY.md` 尚未合入 `main`**（只存在於 `feat/initial-extension` 和 `feat/T0-platform-config`）。`https://github.com/bruce1986/riddle-diary/blob/main/PRIVACY.md` 目前 HTTP 404。內容本身與 `CHROMEWEBSTORE.md` 完全一致。
**下一步（Bruce）**：把 `PRIVACY.md` merge / cherry-pick 到 `main`；URL 立刻活。與 S6 分支決策綁在一起。

### S4 — 字型授權查證 T5 ✅ agent（Sonnet, 2026-07-07）
**結果**：
- Tangerine ✅ OFL 1.1 (Toshi Omagari)
- 辰宇落雁體 ✅ OFL 1.1 (Wang Li-Yu & Liu Wei-Chen)；**jf7000 concern 排除** — jf7000 是字集規格（CC BY-SA 4.0 只管規格文件本身），對照該規格新繪的字型仍以 OFL 1.1 發佈
- LXGW WenKai TC ✅ OFL 1.1（未打包，零風險；bundling 前 checklist 見 agent memo）
- `package-extension.sh` **有** 把 `licenses/` 一併塞進 ZIP（OFL 條款 2 授權文本隨散佈同行 → 滿足）
**Bottom line**：v0.3.1 on font-licence grounds **safe to submit**。

### S5 — Package ZIP 產物審查 ✅ agent（Sonnet, 2026-07-07）→ 已修
**首輪結果**（critical）：
1. `.claude/*` 沒被排除 → 洩漏 1,481 個 worktree 內部檔（含 node_modules 完整樹）
2. `TODO-20260619-1230.md` 是 literal exclusion，`TODO-chromewebstore-launch.md` 直接洩漏
3. 首次跑時 icons 尚未生成（S1 平行進行中）
**已套修正**：`package-extension.sh` 加 `-x ".claude/*"`、`-x "*.zip"`，把 `-x "TODO-20260619-1230.md"` 改成 `-x "TODO-*.md"`。
**Re-run 結果**：`riddle-diary-v0.3.1.zip` = 2.9MB / 25 檔，icons 都在，無洩漏。**safe to submit**。

### S6 — 分支與合入決策 ⏳ 👤 Bruce
需要處理的三件事：
- 把 `PRIVACY.md`（及 T0 平台解耦成果）合入 `main`，才能讓 store listing 的 Privacy Policy URL 活。
- 決定是否為本次上架相關檔案（`CHROMEWEBSTORE.md`、`package-extension.sh`、`icons/*`、`TODO-chromewebstore-launch.md`、`manifest.json` icons 欄位）開新分支 `chore/chromewebstore-launch`，還是直接合進現有工作分支。
- 另有一個 `.claude/worktrees/feat-initial-extension` 平行 session 在 Gemini review round 24，別踩到。

## 狀態圖例
⏳ 待開始 ｜ 🟡 進行中 ｜ ✅ 完成 ｜ ⛔ 阻塞
