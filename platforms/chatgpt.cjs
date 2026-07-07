// platforms/chatgpt.cjs — chatgpt.com / chat.openai.com 平台設定
// 使用 UMD 包裝：瀏覽器由 manifest 依序載入（掛到 globalThis.RiddleDiary），
// Node.js 以 require() 載入（module.exports）。不使用裸 ES export，
// 因為 content.js 是由 manifest 以傳統 script 載入，無法用 ES module。
(function (root) {
  "use strict";

  const PLATFORM = {
    id: "chatgpt",
    siteName: "chatgpt.com",
    // 此平台負責的網域（registry 動態比對：完全相等或子網域）。
    // chat.openai.com 是舊版網址，現多轉址到 chatgpt.com，仍保留以防使用者書籤舊址。
    domains: ["chatgpt.com", "chat.openai.com"],
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
    // ChatGPT 前端屬 React SPA，改版頻繁；以下 selectors 為 research-informed best-effort，
    // 僅作起始值，請 Bruce 在 DevTools 以真實帳號登入後逐一驗證並更新。
    selectors: {
      // ProseMirror contenteditable div（主輸入框）
      editor: '#prompt-textarea, div[contenteditable="true"]',
      // 送出按鈕（data-testid 優先，aria-label 作 fallback）
      sendBtn:
        'button[data-testid="send-button"], button[aria-label*="Send"]',
      // 停止按鈕（僅串流中顯示）
      stopBtn:
        'button[data-testid="stop-button"], button[aria-label*="Stop"]',
      // AI 回覆訊息容器
      response: '[data-message-author-role="assistant"]',
      // 使用者訊息容器
      userMsg: '[data-message-author-role="user"]',
      // 剔除無障礙標籤與按鈕等雜訊
      noise: '.sr-only, [class*="sr-only"], button',
      // 側邊欄歷史對話連結（URL 型如 /c/<uuid>）
      historyItem: 'nav a[href^="/c/"]',
      historyItemFallback: 'a[href^="/c/"]',
    },

    // 只在對話相關頁面顯示日記，排除登入、設定、定價等功能頁。
    // 涵蓋：根路徑 /、對話頁 /c/<uuid>、分享頁 /share/<id>、GPT 頁 /g/<slug>。
    isOverlayPath: function (pathname) {
      return (
        pathname === "/" ||
        /^\/(c|share|g)\//.test(pathname)
      );
    },

    // 既有對話頁：/c/<uuid>（20 位以上英數連字號）
    isExistingConversationPath: function (pathname) {
      return /^\/c\/[0-9a-f-]{20,}$/i.test(pathname);
    },

    // ChatGPT 的輸入框為 ProseMirror contenteditable，寫入策略與 claude.ai 相同。
    // ※ 實際行為需以 content.js 的 writeStrategy 分支驗證，目前沿用 prosemirror。
    writeStrategy: "prosemirror",

    // newChatPath overlaps intentionally with isOverlayPath's "/" — after navigation, isExistingConversationPath still correctly returns false, so intro logic works. TODO(T4-E): consider a more specific new-chat URL if ChatGPT exposes one.
    // 新對話的起始路徑（content.js 的「翻開新的一頁」按鈕使用）。
    newChatPath: "/",

    features: {
      history: true,
    },
  };

  const api = (root.RiddleDiary = root.RiddleDiary || {});
  api.platforms = api.platforms || {};
  api.platforms.chatgpt = PLATFORM;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = PLATFORM;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
