// platforms/registry.cjs — 依 hostname 選取平台設定；找不到 → null（不啟用覆蓋層）
// 使用 UMD 包裝：瀏覽器由 manifest 依序載入，Node.js 以 require() 載入。
// 注意：registry.cjs 不知道有哪些平台——它只看 globalThis.RiddleDiary.platforms，
// 由各平台的 .cjs 檔掛上去。manifest 載入順序必須讓平台檔先於 content.js 執行。
(function (root) {
  "use strict";

  function selectPlatform(hostname) {
    // 防禦：非字串（null/undefined 等）直接視為無對應，避免 hostname.endsWith 丟 TypeError
    if (typeof hostname !== "string") return null;
    const api = root.RiddleDiary || {};
    const platforms = api.platforms || {};
    // 動態走訪已註冊平台，比對各自宣告的 domains（不在此硬編碼任何網域，
    // 新增平台只需在其設定檔加 domains，registry 不必改）。
    for (const p of Object.values(platforms)) {
      const domains = (p && p.domains) || [];
      for (const d of domains) {
        // 完全相等或子網域（用 "." + d 結尾比對，避免 evilclaude.ai 之類誤判）
        if (hostname === d || hostname.endsWith("." + d)) return p;
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
