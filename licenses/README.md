# Font Licenses ｜ 字型授權檔

This folder keeps the license files for the fonts used by the extension, so they travel with any distribution.

本資料夾保存擴充所使用字型的授權文件，散佈時一併附帶。

| File / 檔案 | Font / 字型 | Source / 來源 | License / 授權 | Status / 狀態 |
|---|---|---|---|---|
| `ChenYuluoyan-OFL.txt` | Chenyuluoyan 辰宇落雁體 (Chinese / 中文主字型) | gh: Chenyu-otf/chenyuluoyan_thin@2.0 | OFL 1.1 (reserved name / 保留字型名稱) | ✅ bundled in `fonts/` |
| `LXGW-WenKai-TC-OFL.txt` | LXGW WenKai TC 霞鶩文楷 (fallback / 補字後備) | gh: lxgw/LxgwWenKaiTC | OFL (incl. Klee Project) | ✅ kept for reference |
| `Tangerine-LICENSE.txt` | Tangerine (English / 英文) | Google Fonts / npm: @fontsource/tangerine | ✅ **SIL OFL 1.1** (reserved name "Tangerine") | ✅ confirmed |
| `IM-Fell-English-LICENSE.txt` | IM Fell English (alternate, unused / 備選未用) | npm: @fontsource/im-fell-english | fontsource LICENSE is a stub | ⚠️ if re-enabled |

## Notes ｜ 說明

- **Tangerine — confirmed SIL OFL 1.1.** The first line of `Tangerine-LICENSE.txt` reads "Copyright … All rights reserved", which is the standard OFL copyright-holder notice (`Tangerine` is the OFL Reserved Font Name); the file then contains the full SIL OFL 1.1 text granting use/embed/redistribute. OFL explicitly permits bundling fonts with software, so local bundling here is compliant.
  Tangerine 已確認為 **SIL OFL 1.1**。授權檔第 1 行「All rights reserved」是 OFL 版權人標準寫法（`Tangerine` 是保留字型名稱），其後即完整 OFL 1.1 條款，明文允許嵌入/隨軟體散佈，故本地打包合規。
- **Chenyuluoyan 2.0** merges the "jf 7000" character set — confirm that set's license is OFL‑compatible.
  辰宇落雁體 2.0 併入「jf 7000 字集」，需確認該字集授權與 OFL 相容。
- **Distribution matters.** Bundling a font (as we do for Chenyuluoyan) means redistributing it, so its OFL/LICENSE must ship alongside — which is exactly why this folder exists.
  **散佈情境很重要。** 打包字型（如辰宇落雁體）等於再散佈該字型，必須隨附其 OFL/LICENSE —— 這也是本資料夾存在的原因。
