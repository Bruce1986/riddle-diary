# Font Licenses ｜ 字型授權檔

This folder keeps the license files for the fonts used by the extension, so they travel with any distribution.

本資料夾保存擴充所使用字型的授權文件，散佈時一併附帶。

| File / 檔案 | Font / 字型 | Source / 來源 | License / 授權 | Status / 狀態 |
|---|---|---|---|---|
| `ChenYuluoyan-OFL.txt` | Chenyuluoyan 辰宇落雁體 (Chinese / 中文主字型) | gh: Chenyu-otf/chenyuluoyan_thin@2.0 | OFL 1.1 (reserved name / 保留字型名稱) | ✅ bundled in `fonts/` |
| `LXGW-WenKai-TC-OFL.txt` | LXGW WenKai TC 霞鶩文楷 (fallback / 補字後備) | gh: lxgw/LxgwWenKaiTC | OFL (incl. Klee Project) | ✅ kept for reference |
| `Tangerine-LICENSE.txt` | Tangerine (English / 英文) | npm: @fontsource/tangerine | ⚠️ header says "All rights reserved" — confirm Google Fonts terms | ⚠️ to verify |
| `IM-Fell-English-LICENSE.txt` | IM Fell English (alternate, unused / 備選未用) | npm: @fontsource/im-fell-english | fontsource LICENSE is a stub | ⚠️ if re-enabled |

## To verify ｜ 待查證

- **Tangerine**: the bundled header reads "All rights reserved", which sits oddly with "free to use". Google Fonts usually ships under OFL or Apache‑2.0 — confirm on the Google Fonts page and keep the correct text.
  Tangerine 的授權檔開頭寫「All rights reserved」，與「可自由使用」看似矛盾。Google Fonts 一般以 OFL 或 Apache‑2.0 散佈，請到 Google Fonts 字型頁確認並保存正確條款。
- **Chenyuluoyan 2.0** merges the "jf 7000" character set — confirm that set's license is OFL‑compatible.
  辰宇落雁體 2.0 併入「jf 7000 字集」，需確認該字集授權與 OFL 相容。
- **Distribution matters.** Bundling a font (as we do for Chenyuluoyan) means redistributing it, so its OFL/LICENSE must ship alongside — which is exactly why this folder exists.
  **散佈情境很重要。** 打包字型（如辰宇落雁體）等於再散佈該字型，必須隨附其 OFL/LICENSE —— 這也是本資料夾存在的原因。
