// platforms/registry.cjs — 依 hostname 選取平台設定；找不到 → null（不啟用覆蓋層）
// 使用 UMD 包裝：瀏覽器由 manifest 依序載入，Node.js 以 require() 載入。
// 注意：registry.cjs 不知道有哪些平台——它只看 globalThis.RiddleDiary.platforms，
// 由各平台的 .cjs 檔掛上去。manifest 載入順序必須讓平台檔先於 content.js 執行。
(function (root) {
  "use strict";

  function selectPlatform(hostname) {
    // 防禦：非字串（null/undefined 等）直接視為無對應，避免 hostname.endsWith 丟 TypeError
    if (typeof hostname !== "string") return null;
    // 網域大小寫不敏感：統一轉小寫再比對（hostname 與各 domain 皆正規化）
    const normalizedHostname = hostname.toLowerCase();
    const api = root.RiddleDiary || {};
    const platforms = api.platforms || {};
    // 動態走訪已註冊平台，比對各自宣告的 domains（不在此硬編碼任何網域，
    // 新增平台只需在其設定檔加 domains，registry 不必改）。
    for (const p of Object.values(platforms)) {
      const domains = p && p.domains;
      // 防禦：domains 非陣列就跳過（字串會被 for...of 逐字迭代、其他型別會丟 TypeError）
      if (!Array.isArray(domains)) continue;
      for (const d of domains) {
        if (typeof d !== "string" || d.trim() === "") continue; // 跳過空字串/純空白，避免 endsWith(".") 誤配
        const normalizedDomain = d.toLowerCase();
        // 完全相等或子網域（用 "." + domain 結尾比對，避免 evilclaude.ai 之類誤判）。
        // 子網域比對純屬防禦性：manifest 刻意維持 apex-only（https://claude.ai/*），
        // 因為 www.claude.ai 等子網域實測 301 導回 apex、不獨立服務，毋須擴大 host 權限。
        if (
          normalizedHostname === normalizedDomain ||
          normalizedHostname.endsWith("." + normalizedDomain)
        ) {
          return p;
        }
      }
    }
    return null;
  }

  const api = (root.RiddleDiary = root.RiddleDiary || {});
  api.selectPlatform = selectPlatform;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { selectPlatform: selectPlatform };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
