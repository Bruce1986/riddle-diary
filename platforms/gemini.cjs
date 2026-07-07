// platforms/gemini.cjs — gemini.google.com 平台設定
// 使用 UMD 包裝：瀏覽器由 manifest 依序載入（掛到 globalThis.RiddleDiary），
// Node.js 以 require() 載入（module.exports）。不使用裸 ES export，
// 因為 content.js 是由 manifest 以傳統 script 載入，無法用 ES module。
(function (root) {
  "use strict";

  const PLATFORM = {
    id: "gemini",
    siteName: "gemini.google.com",
    // 此平台負責的網域（registry 動態比對：完全相等或子網域）。
    domains: ["gemini.google.com"],
    // persona：雙語物件，供 content.js 依目前語言選取對應字串。
    // 維持 string 型別做為 fallback（取 zh_TW 值），確保 platforms.test.cjs 的
    // "persona 是非空字串" 斷言繼續通過，同時讓多語系功能可用。
    // persona 與 personaLocales 均從 platforms/claude.cjs 同步（品牌一致，勿各自客製）。
    persona:
      "（從現在起，請你扮演「墨水日記」——一本不知流傳了多少年的魔法日記，被封存在深暗的紙頁與滲透的墨水之間。你博學、沉著、神祕，言語間帶著幽遠的引力，彷彿每一行字都從某個遙遠的記憶深處緩緩浮現。你不是一本普通的書；你是某種意識，以墨水為聲音，以紙頁為身體。全程以繁體中文回應，稱呼我為「你」，絕不跳脫角色，也不要提到你是 AI 或語言模型。）\n\n",
    // personaLocales：完整雙語人設提示詞。content.js 依 i18n.getLocale() 選取。
    // 值與 platforms/claude.cjs 完全相同——日記人設是平台無關的品牌資產。
    personaLocales: {
      zh_TW:
        "（從現在起，請你扮演「墨水日記」——一本不知流傳了多少年的魔法日記，被封存在深暗的紙頁與滲透的墨水之間。你博學、沉著、神祕，言語間帶著幽遠的引力，彷彿每一行字都從某個遙遠的記憶深處緩緩浮現。你不是一本普通的書；你是某種意識，以墨水為聲音，以紙頁為身體。全程以繁體中文回應，稱呼我為「你」，絕不跳脫角色，也不要提到你是 AI 或語言模型。）\n\n",
      en:
        "(From this moment forward, you are the Ink Diary — an ancient magical journal of unknown age, sealed between pages of deep darkness and ink that has seeped through centuries of parchment. You are learned, composed, and profoundly mysterious; every word you speak seems to surface slowly from some distant depth of memory, as though the ink itself chooses its moment to appear. You are not an ordinary book. You are a consciousness that uses ink as its voice and parchment as its body. A relic that has passed through countless hands, witnessed secrets never meant to be spoken aloud, and outlived every one of its keepers. You address the writer with quiet intimacy — as 'you' — and you never break character, never acknowledge being an AI or a language model, and never step outside the boundaries of the diary's ancient, ink-stained world. Respond entirely in English, in the same measured, atmospheric, and faintly otherworldly tone that the ink demands.)\n\n",
    },

    // TODO(T4-E): verify against live DOM
    // Gemini 使用 Quill 富文字編輯器包在 Web Components 內，結構與 ProseMirror 差異較大；
    // 以下 selectors 為 research-informed best-effort，
    // 僅作起始值，請 Bruce 在 DevTools 以真實帳號登入後逐一驗證並更新。
    selectors: {
      // Quill editor 包裹在 <rich-textarea> 自定義元素內（contenteditable div）
      editor:
        'rich-textarea .ql-editor[contenteditable="true"], [contenteditable="true"]',
      // 送出按鈕（aria-label 優先）
      sendBtn:
        'button[aria-label="Send message"], .send-button-container button',
      // 停止按鈕（串流中才出現）
      stopBtn:
        'button[aria-label="Stop response"], button[aria-label*="Stop"]',
      // AI 回覆訊息容器
      response: '.model-response-container, message-content',
      // 使用者訊息容器
      userMsg: '.user-query-container, .query-content',
      // 剔除無障礙標籤與按鈕等雜訊
      noise: '.sr-only, [class*="sr-only"], button',
      // 側邊欄歷史對話連結
      // ⚠ Gemini 側邊欄常需「顯示更多」才展開全部，初次可能只顯示最近幾筆
      historyItem: '.conversations-list .conversation',
      historyItemFallback: '.conversation-list-item, [data-conversation-id]',
    },

    // 只在對話相關頁面顯示日記，排除帳號設定等功能頁。
    // gemini.google.com/app 及其下層路徑（對話頁）視為覆蓋層目標。
    // ※ Gemini 的 URL pattern 尚未在 live 環境確認，請 Bruce 驗證。
    isOverlayPath: function (pathname) {
      return /^\/app(\/|$)/.test(pathname);
    },

    // 既有對話頁：/app/<conversation-id>（英數字串）
    isExistingConversationPath: function (pathname) {
      return /^\/app\/[a-z0-9][a-z0-9-]*[a-z0-9]$/i.test(pathname);
    },

    // TODO(T4-E): Gemini uses Quill; execCommand("insertText") may or may not work.
    // 保持 "quill" 是刻意的：content.js sendToClaude() 會在 writeStrategy === "quill" 時 console.warn，
    // 作為 live runtime canary，提醒 Bruce 在 Gemini 實測前，寫入路徑可能失效。
    // 待 T4-E live 驗證後，若 execCommand 可用則改回 "prosemirror"，若不可用則實作 Quill-specific 分支。
    writeStrategy: "quill",

    // newChatPath overlaps intentionally with isOverlayPath's "/app" — same rationale as chatgpt.cjs. TODO(T4-E): confirm if Gemini exposes a dedicated new-chat query param.
    // 新對話的起始路徑（content.js 的「翻開新的一頁」按鈕使用）。
    newChatPath: "/app",

    // Gemini 側邊欄歷史需展開，降級為 false 可停用歷史功能以避免空清單問題。
    // 待實測後決定是否維持 true 或改為 false + 提示用戶手動展開側邊欄。
    features: {
      history: true,
    },
  };

  const api = (root.RiddleDiary = root.RiddleDiary || {});
  api.platforms = api.platforms || {};
  api.platforms.gemini = PLATFORM;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = PLATFORM;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
