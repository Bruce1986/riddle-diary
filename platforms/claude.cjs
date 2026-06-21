// platforms/claude.cjs — claude.ai 平台設定
// 使用 UMD 包裝：瀏覽器由 manifest 依序載入（掛到 globalThis.RiddleDiary），
// Node.js 以 require() 載入（module.exports）。不使用裸 ES export，
// 因為 content.js 是由 manifest 以傳統 script 載入，無法用 ES module。
(function (root) {
  "use strict";

  const PLATFORM = {
    id: "claude",
    siteName: "claude.ai",
    // 此平台負責的網域（registry 動態比對：完全相等或子網域 *.claude.ai）。
    // 新增平台時各自宣告 domains，不必再改 registry.cjs。
    domains: ["claude.ai"],
    // 原 PERSONA 字串，原封不動
    persona:
      "（從現在起，請你扮演「湯姆·瑞斗的日記」這個被封存在紙頁中的記憶——博學、沉著、神祕，帶著一絲引導與操縱的語氣。全程以繁體中文回應，稱呼我為「你」，絕不跳脫角色，也不要提到你是 AI 或語言模型。）\n\n",

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

    // 輸入策略：送出時使用 ProseMirror / execCommand / beforeinput 流程
    writeStrategy: "prosemirror",

    // 功能旗標（為日後多平台預留，claude.ai 預設全開）
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
