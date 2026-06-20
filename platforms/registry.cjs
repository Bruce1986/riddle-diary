// platforms/registry.js — 依 hostname 選取平台設定；找不到 → null（不啟用覆蓋層）
// 使用 UMD 包裝：瀏覽器由 manifest 依序載入，Node.js 以 require() 載入。
// 注意：registry.js 不知道有哪些平台——它只看 globalThis.RiddleDiary.platforms，
// 由各平台的 js 檔掛上去。manifest 載入順序必須讓平台檔先於 content.js 執行。
(function (root) {
  "use strict";

  function selectPlatform(hostname) {
    var api = root.RiddleDiary || {};
    var p = api.platforms || {};
    // 用結尾比對避免子網域誤判（claude.ai 與 *.claude.ai）；只比對已註冊平台
    if (hostname === "claude.ai" || hostname.endsWith(".claude.ai")) {
      return p.claude || null;
    }
    return null;
  }

  var api = (root.RiddleDiary = root.RiddleDiary || {});
  api.selectPlatform = selectPlatform;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { selectPlatform: selectPlatform };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
