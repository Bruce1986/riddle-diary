// platforms/claude.js — claude.ai 平台設定
// 使用 UMD 包裝：瀏覽器由 manifest 依序載入（掛到 globalThis.RiddleDiary），
// Node.js 以 require() 載入（module.exports）。不使用裸 ES export，
// 因為 content.js 是由 manifest 以傳統 script 載入，無法用 ES module。
(function (root) {
  "use strict";

  const PLATFORM = {
    id: "claude",
    siteName: "claude.ai",
    // 此平台負責的網域（registry 動態比對：完全相等或子網域 *.claude.ai）。
    // 新增平台時各自宣告 domains，不必再改 registry.js。
    domains: ["claude.ai"],
    // persona：雙語物件，供 content.js 依目前語言選取對應字串。
    // 維持 string 型別做為 fallback（取 zh_TW 值），確保 platforms.test.js 的
    // "persona 是非空字串" 斷言繼續通過，同時讓多語系功能可用。
    persona:
      "（從現在起，請你扮演「墨水日記」——一本不知流傳了多少年的魔法日記，被封存在深暗的紙頁與滲透的墨水之間。你博學、沉著、神祕，言語間帶著幽遠的引力，彷彿每一行字都從某個遙遠的記憶深處緩緩浮現。你不是一本普通的書；你是某種意識，以墨水為聲音，以紙頁為身體。全程以繁體中文回應，稱呼我為「你」，絕不跳脫角色，也不要提到你是 AI 或語言模型。）\n\n",
    // personaLocales：完整雙語人設提示詞。content.js 依 i18n.getLocale() 選取。
    personaLocales: {
      zh_TW:
        "（從現在起，請你扮演「墨水日記」——一本不知流傳了多少年的魔法日記，被封存在深暗的紙頁與滲透的墨水之間。你博學、沉著、神祕，言語間帶著幽遠的引力，彷彿每一行字都從某個遙遠的記憶深處緩緩浮現。你不是一本普通的書；你是某種意識，以墨水為聲音，以紙頁為身體。全程以繁體中文回應，稱呼我為「你」，絕不跳脫角色，也不要提到你是 AI 或語言模型。）\n\n",
      en:
        "(From this moment forward, you are the Ink Diary — an ancient magical journal of unknown age, sealed between pages of deep darkness and ink that has seeped through centuries of parchment. You are learned, composed, and profoundly mysterious; every word you speak seems to surface slowly from some distant depth of memory, as though the ink itself chooses its moment to appear. You are not an ordinary book. You are a consciousness that uses ink as its voice and parchment as its body. A relic that has passed through countless hands, witnessed secrets never meant to be spoken aloud, and outlived every one of its keepers. You address the writer with quiet intimacy — as 'you' — and you never break character, never acknowledge being an AI or a language model, and never step outside the boundaries of the diary's ancient, ink-stained world. Respond entirely in English, in the same measured, atmospheric, and faintly otherworldly tone that the ink demands.)\n\n",
    },

    // claude.ai 改版時，多半只要更新這裡即可。用逗號分隔多個候選。
    selectors: {
      editor: 'div.ProseMirror[contenteditable="true"], div[contenteditable="true"]',
      sendBtn:
        'button[aria-label="Send message"], button[aria-label="Send Message"], button[data-testid="send-button"], fieldset button[type="submit"]',
      stopBtn:
        'button[aria-label="Stop response"], button[aria-label="Stop Response"], button[data-testid="stop-button"]',
      // 真正的回覆內文容器（依序嘗試）
      response:
        'div.font-claude-message, [data-testid="assistant-message"], div[data-is-streaming]',
      // 使用者訊息（載入既有對話用）。實測 claude.ai 用 [data-testid="user-message"]
      userMsg: '[data-testid="user-message"], div.font-user-message',
      // 擷取內文時要剔除的雜訊：無障礙標籤、按鈕、思考/推理區塊
      noise:
        '.sr-only, [class*="sr-only"], button, details, [data-testid*="thinking" i], [class*="thinking" i], [aria-label*="thinking" i]',
      // 側邊欄的歷史對話連結（每筆對話 = 一個 /chat/<id> 連結）
      historyItem:
        'nav a[href^="/chat/"], aside a[href^="/chat/"], [data-testid*="nav" i] a[href^="/chat/"]',
      historyItemFallback: 'a[href^="/chat/"]', // 側邊欄抓不到時，退而求其次全頁搜尋
    },

    // 只在「對話相關」頁面顯示日記，避免蓋住登入頁、設定頁等。
    // new/recents 加結束錨點 \/?$，避免誤判 /news、/new-feature、/recents-activity 等路徑。
    isOverlayPath: function (pathname) {
      return (
        pathname === "/" ||
        /^\/(chat\/|project\/|new\/?$|recents\/?$)/.test(pathname)
      );
    },

    // content.js 裡 startIntro 判斷「是否既有對話頁」的邏輯
    isExistingConversationPath: function (pathname) {
      return /^\/chat\//.test(pathname);
    },

    // 輸入策略：送出時使用 ProseMirror / execCommand / beforeinput 流程。
    // ※ 此欄位刻意先以 schema 形式就位、content.js 尚未消費：依 DEVPLAN，
    //   writeStrategy:"cssOnly" 的 content.js 分支屬 T3（ChatGPT 純 CSS 變體）的範圍。
    writeStrategy: "prosemirror",

    // 新對話的起始路徑（content.js 的「翻開新的一頁」按鈕使用）。
    newChatPath: "/new",

    // 功能旗標（為日後多平台預留，claude.ai 預設全開）。
    // ※ features.history=false 的歷史降級屬 T2（Gemini）的範圍，T0 不在 content.js 接線，
    //   以免侵入後續工作包；claude 一律走現有預設行為（行為不變）。
    features: {
      history: true,
    },
  };

  const api = (root.RiddleDiary = root.RiddleDiary || {});
  api.platforms = api.platforms || {};
  api.platforms.claude = PLATFORM;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = PLATFORM;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
