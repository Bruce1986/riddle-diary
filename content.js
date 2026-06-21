// 湯姆瑞斗的日記本 — content script
// 在 claude.ai 上蓋一層日記介面，並橋接到底層真正的 Claude 對話。
(function () {
  "use strict";

  // ── 可維護的選擇器 ──────────────────────────────────────────────
  // claude.ai 改版時，多半只要更新這裡即可。用逗號分隔多個候選。
  const SELECTORS = {
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
  };

  const PERSONA =
    "（從現在起，請你扮演「湯姆·瑞斗的日記」這個被封存在紙頁中的記憶——博學、沉著、神祕，帶著一絲引導與操縱的語氣。全程以繁體中文回應，稱呼我為「你」，絕不跳脫角色，也不要提到你是 AI 或語言模型。）\n\n";

  const PEN_PLACEHOLDER = "在此落筆…（Enter 送出，Shift+Enter 換行）";
  const PEN_PLACEHOLDER_BUSY = "日記正在回覆中…（可繼續落筆，會依序送出）";

  let state = { enabled: true, persona: true };
  let personaSent = false; // 每次載入只在第一則訊息前置人設
  let busy = false;
  const queued = []; // busy 時按 Enter 的訊息佇列，本回合結束後依序送出
  let overlay = null;
  let fontsInjected = false;
  let lastRenderedFingerprint = ""; // 用於偵測 SPA 換頁時 claude.ai 的 DOM 是否已換上新對話
  // 進行中的計時器（換頁時需清除，避免舊對話的回應/輪詢寫進新對話）
  let activeResponseTimer = null; // watchResponse 的輪詢
  let trackStreamingTimer = null; // trackIfStreaming 的輪詢（與 watchResponse 各自獨立，避免互相覆蓋）
  let introPoll = null; // startIntro 的訊息輪詢
  let reloadTimer = null; // SPA 換頁後延遲重載
  let openBookTimer = null; // 書封翻開動畫後移除書封的延遲計時器
  let rdTextHolder = null; // cleanText 重複使用的離畫面容器（已移除 visibility:hidden，避免 innerText 變空）

  // 只在「對話相關」頁面顯示日記，避免蓋住登入頁、設定頁等
  function onOverlayPath() {
    return (
      location.pathname === "/" ||
      /^\/(chat\/|project\/|new|recents)/.test(location.pathname)
    );
  }

  // 兩個字型都打包在擴充內，以 chrome-extension:// URL 注入 @font-face，完全不對外連線，
  // 也繞過 claude.ai 的 CSP（其 font-src 白名單不含外部 CDN）。
  function injectFonts() {
    if (fontsInjected) return;
    let cn, en;
    try {
      en = chrome.runtime.getURL("fonts/Tangerine-700.ttf");
      cn = chrome.runtime.getURL("fonts/ChenYuluoyan-Thin.ttf");
    } catch (e) {
      return; // context 失效，改用系統字型 fallback
    }
    fontsInjected = true;
    // 擴充重載後新 context 的 fontsInjected 為 false，會再注入一次；先移除舊標籤避免 DOM 殘留重複
    const staleFont = document.getElementById("rd-fontface");
    if (staleFont) staleFont.remove();
    const style = document.createElement("style");
    style.id = "rd-fontface";
    style.textContent =
      "@font-face{font-family:'Diary EN';font-style:normal;font-weight:400 700;font-display:swap;size-adjust:175%;" +
      "src:url('" + en + "') format('truetype');}" +
      "@font-face{font-family:'Chenyu';font-style:normal;font-weight:400;font-display:swap;" +
      "src:url('" + cn + "') format('truetype');}";
    document.documentElement.appendChild(style);
  }

  // ── chrome.* 安全包裝（擴充重載後，舊分頁的 context 會失效） ──────
  function extValid() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }
  function safeStorageGet(defaults, cb) {
    try {
      chrome.storage.sync.get(defaults, cb);
    } catch (e) {
      cb(defaults); // context 失效 → 用預設值
    }
  }
  function safeStorageSet(obj) {
    try {
      if (extValid()) chrome.storage.sync.set(obj);
    } catch (e) {
      /* context 失效，略過持久化 */
    }
  }

  // ── 啟動 ────────────────────────────────────────────────────────
  safeStorageGet({ rd_enabled: true, rd_persona: true }, (cfg) => {
    state.enabled = cfg.rd_enabled;
    state.persona = cfg.rd_persona;
    if (state.enabled && onOverlayPath()) buildOverlay();
  });

  try {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.rd_enabled) {
        state.enabled = changes.rd_enabled.newValue;
        if (state.enabled) {
          if (!overlay) {
            if (onOverlayPath()) buildOverlay();
          } else if (onOverlayPath()) {
            overlay.classList.remove("rd-hidden");
            // 重新啟用時主動同步：清狀態、清空、重載目前對話
            // （涵蓋「日記隱藏期間切換過對話」的邊界；非對話頁則維持隱藏不蓋頁面）
            lastUrl = location.href;
            resetState();
            lastRenderedFingerprint = ""; // 重新啟用即是要立刻鋪上目前對話，不必等指紋改變
            const feed = overlay.querySelector("#rd-feed");
            if (feed) feed.innerHTML = "";
            startIntro();
          }
        } else if (overlay) {
          overlay.classList.add("rd-hidden");
          resetState(); // 停用時清掉背景計時器
        }
      }
      if (changes.rd_persona) state.persona = changes.rd_persona.newValue;
    });
  } catch (e) {
    /* context 失效，略過監聽 */
  }

  // 統一清除所有進行中的計時器並重置狀態（換頁／闔上／停用時呼叫，避免背景計時器空轉）
  function resetState() {
    if (activeResponseTimer) { clearInterval(activeResponseTimer); activeResponseTimer = null; }
    if (trackStreamingTimer) { clearInterval(trackStreamingTimer); trackStreamingTimer = null; }
    if (introPoll) { clearInterval(introPoll); introPoll = null; }
    if (reloadTimer) { clearTimeout(reloadTimer); reloadTimer = null; }
    if (openBookTimer) { clearTimeout(openBookTimer); openBookTimer = null; }
    busy = false;
    queued.length = 0;
    const pen = overlay && overlay.querySelector("#rd-pen");
    if (pen) pen.placeholder = PEN_PLACEHOLDER;
  }

  // 監看 SPA 換頁：claude.ai 在側邊欄切換對話不會重整頁面，
  // content script 在隔離世界攔不到頁面的 history.pushState，故以輪詢 location.href 偵測。
  let lastUrl = location.href;
  function watchUrlChanges() {
    const id = setInterval(() => {
      if (!extValid()) { clearInterval(id); return; } // 擴充重載後舊分頁 context 失效 → 停掉輪詢
      if (location.href === lastUrl) return;
      lastUrl = location.href; // 隨時更新；隱藏時切換對話的重載改由「重新啟用」時主動處理
      if (!overlay) return;
      // 導航到非對話頁（/settings、/login…）→ 隱藏日記，別蓋住頁面
      if (!onOverlayPath()) {
        if (!overlay.classList.contains("rd-hidden")) {
          overlay.classList.add("rd-hidden");
          resetState(); // 清掉背景計時器，避免隱藏後仍空轉
        }
        return;
      }
      // 已隱藏：若是使用者主動停用（state.enabled=false）則保持隱藏，重載交由「重新啟用」處理；
      // 若只是先前離開對話頁而被自動隱藏（仍 enabled），回到對話頁就重新顯示。
      if (overlay.classList.contains("rd-hidden")) {
        if (!state.enabled) return;
        overlay.classList.remove("rd-hidden");
      }
      // 換對話了 → 統一重置（清計時器/busy/佇列），再重設換頁專屬狀態
      resetState();
      personaSent = false; // 新對話要重新前置人設
      overlay.classList.remove("rd-hist-open");
      const feed = overlay.querySelector("#rd-feed");
      if (feed) feed.innerHTML = "";
      reloadTimer = setTimeout(startIntro, 100); // 快速啟動，由 startIntro 內部的指紋比對確保 DOM 已換新
    }, 700);
  }

  // 讓非 <button> 的可點元素也能用鍵盤（Enter / Space）操作
  function onActivate(el, fn) {
    el.addEventListener("click", fn);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        fn(e);
      }
    });
  }

  // ── 介面 ────────────────────────────────────────────────────────
  function buildOverlay() {
    if (overlay) return;
    // 擴充重載後舊腳本 context 失效，但其 #rd-overlay 仍殘留在頁面；
    // 新腳本的 overlay 變數為 null，若不先清掉舊節點會重複疊一層、事件重複綁定。
    const stale = document.getElementById("rd-overlay");
    if (stale) stale.remove();
    injectFonts();
    overlay = document.createElement("div");
    overlay.id = "rd-overlay";
    overlay.innerHTML = `
      <div id="rd-book">
        <div id="rd-bookmark" role="button" tabindex="0" aria-label="翻開左側的歷史篇章" title="翻開左側的歷史篇章"><span>書籤</span></div>

        <aside id="rd-history">
          <div class="rd-hist-head">
            <span>過往的篇章</span>
            <button id="rd-hist-close" title="收起">收起 ›</button>
          </div>
          <button id="rd-new" title="翻開全新的一頁">✚ 翻開新的一頁</button>
          <div class="rd-hist-list"></div>
        </aside>

        <div class="rd-corner">
          <button id="rd-peek" title="暫時看一眼底下的 Claude 介面">窺視</button>
          <button id="rd-close" title="闔上日記">闔上</button>
        </div>

        <div id="rd-feed"></div>
        <textarea id="rd-pen" rows="1" placeholder="在此落筆…（Enter 送出，Shift+Enter 換行）"></textarea>
        <div id="rd-caption">羽毛筆 · 墨水會自行滲入紙頁，再由日記回應你</div>

        <div id="rd-cover" role="button" tabindex="0" aria-label="輕觸翻開日記">
          <div class="rd-cover-frame">
            <div class="rd-cover-title">T. M. Riddle</div>
            <div class="rd-cover-rule"></div>
            <div class="rd-cover-sub">A Diary</div>
            <div class="rd-cover-hint">輕觸以翻開</div>
          </div>
        </div>
      </div>`;
    document.documentElement.appendChild(overlay);

    // 輸入：Enter 送出、Shift+Enter 換行、自動長高
    const pen = overlay.querySelector("#rd-pen");
    pen.addEventListener("keydown", (e) => {
      // 忽略「正在輸入法組字中」的 Enter（注音/拼音選字），避免送出後選字結果又被補回框內
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit(pen.value);
      }
    });
    pen.addEventListener("input", () => {
      pen.style.height = "auto";
      pen.style.height = Math.min(pen.scrollHeight, 120) + "px";
    });

    overlay.querySelector("#rd-close").addEventListener("click", () => {
      overlay.classList.add("rd-hidden"); // 直接隱藏，不依賴 storage 事件
      resetState(); // 清掉背景計時器，避免隱藏後還在空轉
      safeStorageSet({ rd_enabled: false }); // 盡力持久化（context 失效時略過）
    });

    // 「窺視」：按住可看底層 Claude，放開即恢復。用 opacity:0 + pointer-events:none 隱藏，
    // 不用 visibility:hidden——它會讓聚焦中的按鈕 blur，鍵盤按住時立刻觸發下方 blur 還原而閃爍。
    // pointer-events:none 後按鈕本身收不到 pointerup，放開事件改掛在 window。
    const peek = overlay.querySelector("#rd-peek");
    const peekShow = () => {
      overlay.style.opacity = "0";
      overlay.style.pointerEvents = "none";
    };
    const peekRestore = () => {
      overlay.style.opacity = "";
      overlay.style.pointerEvents = "";
    };
    peek.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return; // 只允許滑鼠左鍵／觸控；右鍵會跳出選單干擾 pointerup 還原，導致永久隱藏
      e.preventDefault();
      peekShow();
      window.addEventListener("pointerup", peekRestore, { once: true });
      window.addEventListener("pointercancel", peekRestore, { once: true });
    });
    // 鍵盤／螢幕閱讀器：按住 Space/Enter 看一眼，放開或失焦即恢復
    peek.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault(); // 避免 Space 捲動頁面、Enter 觸發 click
        peekShow();
      }
    });
    peek.addEventListener("keyup", (e) => {
      if (e.key === " " || e.key === "Enter") peekRestore();
    });
    peek.addEventListener("blur", peekRestore); // 按住時 Tab 離開仍能恢復

    // 書籤 ↔ 歷史面板
    const bookmark = overlay.querySelector("#rd-bookmark");
    onActivate(bookmark, () => toggleHistory());
    overlay.querySelector("#rd-hist-close").addEventListener("click", () => toggleHistory(false));
    overlay.querySelector("#rd-new").addEventListener("click", () => {
      sessionStorage.setItem("rd_skipcover", "1");
      window.location.href = "/new";
    });

    // 啟動書封：點擊翻開；若剛從歷史切換進來則略過書封
    const cover = overlay.querySelector("#rd-cover");
    if (sessionStorage.getItem("rd_skipcover")) {
      sessionStorage.removeItem("rd_skipcover");
      cover.remove();
      startIntro();
    } else {
      onActivate(cover, openBook);
    }

    watchUrlChanges(); // 開始監看 SPA 換頁
  }

  // ── 啟動書封動畫 ────────────────────────────────────────────────
  function openBook() {
    if (openBookTimer) return; // 動畫進行中：忽略連點，避免重複計時器與重複 startIntro
    const cover = overlay.querySelector("#rd-cover");
    if (!cover) return startIntro();
    cover.classList.add("rd-open");
    openBookTimer = setTimeout(() => {
      openBookTimer = null;
      cover.remove();
      startIntro();
    }, 900);
  }

  function startIntro() {
    const pen = overlay.querySelector("#rd-pen");
    if (introPoll) { clearInterval(introPoll); introPoll = null; } // 避免並行輪詢
    // 在既有對話頁 → 等訊息載入後，把整段對話鋪進日記；否則顯示開場白
    if (/^\/chat\//.test(location.pathname)) {
      let tries = 0;
      introPoll = setInterval(() => {
        if (!extValid()) { clearInterval(introPoll); introPoll = null; return; } // 孤立腳本自我銷毀
        tries++;
        const nodes = document.querySelectorAll(
          SELECTORS.userMsg + "," + SELECTORS.response
        );
        // SPA 換對話時，claude.ai 的 DOM 可能還殘留上一段對話的訊息；
        // 指紋與上次渲染相同代表 DOM 尚未換新，繼續等（逾時才放行，避免極端情況卡死）。
        const fingerprint = Array.from(nodes).map((n) => n.textContent).join("|");
        if (nodes.length && fingerprint === lastRenderedFingerprint && tries < 24) {
          return;
        }
        if (nodes.length) {
          clearInterval(introPoll);
          introPoll = null;
          renderExisting(nodes);
          if (pen) pen.focus();
          trackIfStreaming(); // 若載入時對話仍在串流，追蹤到完成後重新整段渲染
        } else if (tries > 24) {
          clearInterval(introPoll);
          introPoll = null;
          showIntroLine(pen); // 約 7 秒仍無訊息 → 當作空白頁（放寬以容忍慢網路）
        }
      }, 300);
    } else {
      showIntroLine(pen);
    }
  }

  function showIntroLine(pen) {
    ink("翻開了一本沒有主人的舊日記，扉頁上緩緩浮現一行字……", "rd-diary", () =>
      pen && pen.focus()
    );
  }

  // 把既有對話的訊息「立即」鋪進日記（不逐字動畫）。用 DocumentFragment 一次掛上，避免逐行重排。
  function renderExisting(nodes) {
    const feed = overlay.querySelector("#rd-feed");
    feed.innerHTML = "";
    const frag = document.createDocumentFragment();
    outermost(nodes).forEach((node) => { // 去巢狀，避免容器+子元素重複渲染
      const isUser = node.matches(SELECTORS.userMsg);
      const text = cleanText(node);
      if (!text) return;
      const line = document.createElement("div");
      line.className = "rd-line " + (isUser ? "rd-me" : "rd-diary");
      line.textContent = text;
      frag.appendChild(line);
    });
    feed.appendChild(frag);
    feed.scrollTop = feed.scrollHeight;
    // 記下這次渲染的內容指紋，供下次 SPA 換頁時比對 DOM 是否已換新
    lastRenderedFingerprint = Array.from(nodes).map((n) => n.textContent).join("|");
  }

  // 若載入既有對話時 Claude 仍在串流，追蹤到串流結束後「重新整段渲染」（取得最終乾淨內文、避免重複）。
  // 用獨立的 trackStreamingTimer（不與 watchResponse 共用 activeResponseTimer），避免兩者互相覆蓋／誤清；
  // 換頁/闔上時 resetState() 同樣會一併清掉。
  function trackIfStreaming() {
    if (trackStreamingTimer) { clearInterval(trackStreamingTimer); trackStreamingTimer = null; } // 重入保護：先清舊計時器再起新的
    if (!document.querySelector(SELECTORS.stopBtn)) return; // 沒在串流就不用追
    let stable = 0;
    let last = "";
    trackStreamingTimer = setInterval(() => {
      if (!extValid() || !overlay || overlay.classList.contains("rd-hidden")) {
        clearInterval(trackStreamingTimer);
        trackStreamingTimer = null;
        return;
      }
      const streaming = !!document.querySelector(SELECTORS.stopBtn);
      const cur = latestResponseText();
      if (cur !== last) { last = cur; stable = 0; } else stable++;
      if (!streaming && stable >= 3) {
        clearInterval(trackStreamingTimer);
        trackStreamingTimer = null;
        renderExisting(
          document.querySelectorAll(SELECTORS.userMsg + "," + SELECTORS.response)
        );
      }
    }, 400);
  }

  // ── 歷史篇章（書籤翻頁） ────────────────────────────────────────
  function toggleHistory(force) {
    const open = force === undefined ? !overlay.classList.contains("rd-hist-open") : force;
    overlay.classList.toggle("rd-hist-open", open);
    if (open) loadHistory();
  }

  function loadHistory() {
    const list = overlay.querySelector(".rd-hist-list");
    list.innerHTML = "";
    const seen = new Set();
    let count = 0;
    // 優先從側邊欄／導覽列找對話連結；找不到再退而求其次全頁搜尋
    let anchors = document.querySelectorAll(SELECTORS.historyItem);
    if (!anchors.length) anchors = document.querySelectorAll(SELECTORS.historyItemFallback);
    anchors.forEach((a) => {
      const href = a.getAttribute("href");
      if (!href || seen.has(href)) return;
      // 標題：優先 title 屬性；否則 clone 後剝掉 hover 選單按鈕/SVG/無障礙複本再取文字，
      // 避免抓到「我的對話 重新命名 刪除 分享」之類的雜訊
      let title = (a.getAttribute("title") || "").replace(/\s+/g, " ").trim();
      if (!title) {
        const c = a.cloneNode(true);
        c.querySelectorAll(SELECTORS.noise + ", svg").forEach((el) => el.remove());
        // c 尚未掛載，Chrome 對未掛載節點的 innerText 會回空字串；雜訊已剝除，直接用 textContent
        title = (c.textContent || "").replace(/\s+/g, " ").trim();
      }
      if (!title) return;
      // 後備：剝除後若仍出現「整段重複兩次」（可見 + 無障礙複本）才砍半
      const dup = title.match(/^(.{2,}?)\s*\1$/);
      if (dup) title = dup[1].trim();
      if (title.length > 40) title = title.slice(0, 40) + "…";
      seen.add(href);
      const item = document.createElement("button");
      item.className = "rd-hist-item";
      item.textContent = title;
      item.title = title;
      item.addEventListener("click", () => {
        toggleHistory(false); // 收起面板
        // 優先 SPA 軟導航：點擊側邊欄原本的連結，避免整頁重載；
        // watchUrlChanges 會偵測到 URL 改變並把新對話重新鋪進日記。
        // 點擊當下「重新」從 DOM 找最新的同 href 錨點（側邊欄可能已重渲染，舊 a 參照會失效）
        const live =
          document.querySelector('a[href="' + CSS.escape(href) + '"]') ||
          (a.isConnected ? a : null);
        if (live) {
          live.click(); // SPA 軟導航
        } else {
          // 找不到可用錨點 → 退回 hard reload
          sessionStorage.setItem("rd_skipcover", "1");
          window.location.href = href;
        }
      });
      list.appendChild(item);
      count++;
    });
    if (count === 0) {
      list.innerHTML =
        '<div class="rd-hist-empty">翻不到更早的篇章——也許側邊欄尚未展開／載入，或這是一段全新的記憶。</div>';
    }
  }

  // ── 墨水浮現動畫 ────────────────────────────────────────────────
  function ink(text, cls, done) {
    const feed = overlay.querySelector("#rd-feed");
    const line = document.createElement("div");
    line.className = "rd-line " + cls;
    for (const ch of text) {
      const s = document.createElement("span");
      s.textContent = ch;
      line.appendChild(s);
    }
    feed.appendChild(line);
    const spans = line.querySelectorAll("span");
    const step = cls === "rd-me" ? 26 : 65;
    // 長文分批浮現：每 tick 顯示 batch 個字，把總 tick 數壓在 ~120 以內，
    // 避免超長回覆產生數千個 setTimeout／重排造成卡頓（短文 batch=1，視覺不變）。
    const batch = Math.max(1, Math.ceil(spans.length / 120));
    let i = 0;
    (function reveal() {
      if (!line.isConnected) return; // 節點已被移除（如換頁清空 feed）→ 停止，避免孤兒計時器
      if (i < spans.length) {
        for (let n = 0; n < batch && i < spans.length; n++, i++) {
          spans[i].style.opacity = 1;
        }
        feed.scrollTop = feed.scrollHeight;
        setTimeout(reveal, step);
      } else {
        // 動畫結束後把上百個帶 transition 的 span 合併回純文字，釋放 DOM／記憶體，
        // 避免長對話累積數千個節點造成捲動與後續渲染卡頓（已淡入完成，視覺不變）。
        setTimeout(() => { if (line.isConnected) line.textContent = text; }, 500);
        if (done) setTimeout(done, 400);
      }
    })();
    return line;
  }

  // 取得目前所有「助理回覆」節點。
  // 用聯集 querySelectorAll：它以「文件順序」回傳且自動去重，因此 nodes[last]
  // 必為頁面最後一則助理訊息（含串流中的那則），不會被選擇器先後順序誤導。
  // 從節點集合濾掉「被集合內其他節點包含」的內層節點。
  // 因為 SELECTORS.response 的多個選擇器可能同時命中容器與其子元素（querySelectorAll
  // 只會去除「完全相同」的節點，不會去除巢狀），不過濾會造成同一則訊息被算兩次／渲染兩次。
  function outermost(nodeList) {
    const arr = Array.from(nodeList);
    return arr.filter((n) => !arr.some((m) => m !== n && m.contains(n)));
  }

  function responseNodes() {
    return outermost(document.querySelectorAll(SELECTORS.response));
  }

  // 擷取節點的乾淨內文：剔除無障礙標籤、按鈕、思考區塊
  function cleanText(node) {
    if (!node) return "";
    const clone = node.cloneNode(true);
    clone.querySelectorAll(SELECTORS.noise).forEach((el) => el.remove());
    // innerText 在「未掛載節點」會退化為 textContent（丟失段落換行）；掛到離畫面容器再讀。
    // 容器靠 position:absolute;left:-99999px 移出畫面即可，「不可」用 display:none
    // （innerText 會變空字串）；也刻意不加 visibility:hidden——Blink 對 visibility:hidden
    // 元素呼叫 innerText 同樣可能回空字串，會破壞整個訊息擷取。重複使用同一容器避免重排。
    if (!rdTextHolder || !rdTextHolder.isConnected) {
      // 用固定 id 復用，避免擴充重載後新舊腳本各建一個、殘留 DOM 節點
      rdTextHolder = document.getElementById("rd-text-holder");
      if (!rdTextHolder) {
        rdTextHolder = document.createElement("div");
        rdTextHolder.id = "rd-text-holder";
        rdTextHolder.style.cssText =
          "position:absolute;left:-99999px;top:0;width:640px;white-space:pre-wrap;";
        document.documentElement.appendChild(rdTextHolder);
      }
    }
    rdTextHolder.replaceChildren(clone);
    let t = (clone.innerText || "").replace(/ /g, " ").trim();
    rdTextHolder.replaceChildren(); // 清空內容但保留容器供下次重用
    // 去掉開頭可能殘留的無障礙標籤（無障礙複本已由 SELECTORS.noise 的 .sr-only 移除，
    // 不做「整段去重複」——那會誤砍回覆中合法的重複，如「哈哈 哈哈」、詩句、列表）
    t = t.replace(/^(Claude\s+(responded|said)|You\s+said)\s*:?\s*/i, "");
    return t;
  }
  function latestResponseText() {
    const nodes = responseNodes();
    return cleanText(nodes[nodes.length - 1]);
  }

  // ── 送出 + 接收 ─────────────────────────────────────────────────
  function submit(raw) {
    const pen = overlay.querySelector("#rd-pen");
    const text = (raw || "").trim();
    // 編輯器不存在時，不進入 busy（否則佇列會卡死）；直接提示後結束。
    // 注意：此時「不清空輸入框」，避免使用者辛苦打的字在頁面異常下被吞掉。
    if (text && !document.querySelector(SELECTORS.editor)) {
      ink("（紙頁無法與底下的墨池相連…請確認頁面已開啟一個對話）", "rd-diary");
      return;
    }
    pen.value = ""; // 確認可送出（或只是空白/換行）才清空
    pen.style.height = "auto";
    if (!text) return;
    if (busy) {
      queued.push(text); // 正在回覆 → 排入佇列（輪到時才繪製，避免與動畫重疊；placeholder 已提示）
      return;
    }
    startTurn(text);
  }

  // 真正送出一則訊息並監看回覆
  function startTurn(text) {
    busy = true;
    const pen = overlay.querySelector("#rd-pen");
    if (pen) pen.placeholder = PEN_PLACEHOLDER_BUSY; // 視覺回饋：日記正在回覆
    ink(text, "rd-me"); // 在此才繪製使用者這句：排隊的訊息等輪到才浮現，不會疊在動畫上
    let toSend = text;
    if (state.persona && !personaSent) {
      toSend = PERSONA + text;
      personaSent = true;
    }
    const baseline = responseNodes().length;
    const prev = latestResponseText();
    if (sendToClaude(toSend)) {
      watchResponse(baseline, prev);
    } else {
      // 送出失敗：重置 busy 並清掉佇列（否則排隊中的訊息會永遠卡住），還原提示
      busy = false;
      queued.length = 0;
      if (pen) pen.placeholder = PEN_PLACEHOLDER;
    }
  }

  function sendToClaude(text) {
    const ed = document.querySelector(SELECTORS.editor);
    if (!ed) {
      ink("（紙頁無法與底下的墨池相連…請確認頁面已開啟一個對話）", "rd-diary");
      // busy / 佇列的重置一律交給呼叫端 startTurn 同步處理，避免「非同步 callback 設 busy」
      // 與「同步設 busy」互相競態（例如失敗 callback 晚一步把新一輪的 busy 清掉）。
      return false;
    }
    ed.focus();
    // 用 execCommand 寫入 contenteditable，可觸發 React 監聽的 input 事件。
    // 注意：execCommand 失敗時不一定丟例外，常是「回傳 false」——兩種都要視為失敗。
    let inserted = false;
    try {
      // 用 Selection API 精確選取「編輯器內部」的內容再覆寫，避免 execCommand("selectAll")
      // 在 ed 尚未成為 activeElement 時誤選整頁、被 insertText 取代而造成畫面崩潰。
      const sel = window.getSelection();
      if (sel) { // getSelection 在極端情境（失焦、特殊 context）可能回 null，防禦性檢查
        const range = document.createRange();
        range.selectNodeContents(ed);
        sel.removeAllRanges();
        sel.addRange(range);
        inserted = document.execCommand("insertText", false, text);
      }
    } catch (e) {
      inserted = false;
    }
    if (!inserted) {
      // execCommand 失敗時不再派發合成 beforeinput：claude.ai 的 ProseMirror 靠 DOM 變動觀察器
      // 取得輸入，而合成事件不會觸發瀏覽器的預設插入，文字其實寫不進去，只會拖到 watchResponse
      // 約 36 秒逾時才解鎖。直接提示並回傳 false，由 startTurn 立即重置 busy／佇列，避免介面卡住。
      ink("（紙頁無法把墨水寫入底下的輸入框…請重新整理頁面或手動輸入）", "rd-diary");
      return false;
    }
    // 寫入後，ProseMirror/React 需要極短時間才會啟用送出鈕。用短輪詢（最多 ~500ms）
    // 等鈕啟用再點，比寫死延遲更穩；都等不到才退回派發 Enter 鍵盤事件（保底）。
    let attempts = 0;
    const trySend = () => {
      const btn = document.querySelector(SELECTORS.sendBtn);
      if (btn && !btn.disabled) {
        btn.click();
        return;
      }
      if (attempts++ < 10) {
        setTimeout(trySend, 50);
        return;
      }
      ["keydown", "keyup"].forEach((type) =>
        ed.dispatchEvent(
          new KeyboardEvent(type, {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
          })
        )
      );
    };
    setTimeout(trySend, 50);
    // 回傳 true = 已「嘗試」送出（找得到輸入框）。實際送出在輪詢中非同步進行；
    // 若送出鈕始終不啟用且 Enter fallback 也沒觸發，watchResponse 會在約 36 秒無回應後
    // 顯示「沒有回音」並解鎖 —— 刻意的優雅降級，無法從外部即時確認 Claude 是否收到。
    return true;
  }

  // 等 Claude 寫完，再讓乾淨的回覆「一次浮現」（避開串流重排造成的重複）
  function watchResponse(baseline, prev) {
    let ticks = 0;
    let sawStreaming = false;
    let appeared = false;
    let lastText = "";
    let stableTicks = 0;

    const waiting = ink("墨水正在紙頁上凝聚……", "rd-diary"); // 等待時的提示墨痕

    const timer = setInterval(() => {
      if (!extValid()) { // 孤立腳本（擴充重載後）自我銷毀，別在背景空轉改 DOM
        clearInterval(timer);
        if (timer === activeResponseTimer) activeResponseTimer = null;
        return;
      }
      ticks++;
      const streaming = !!document.querySelector(SELECTORS.stopBtn);
      if (streaming) sawStreaming = true;

      // 先等「新的回覆」出現（節點變多，或開始串流）
      if (!appeared) {
        if (responseNodes().length > baseline || streaming) appeared = true;
        else if (ticks > 120) return finish(timer, waiting, null); // 約 36s 無回應
        else return;
      }

      const cur = latestResponseText();
      // 已有「新的回覆節點」時就接受內容，即使文字剛好與上一則相同（如再問一次、相同短句）；
      // 只有在沒有新節點、且內容仍等於送出前舊回覆時，才視為「還沒開始回」。
      const grew = responseNodes().length > baseline;
      if (!cur || (cur === prev && !grew)) {
        if (ticks > 220) return finish(timer, waiting, null);
        return;
      }
      if (cur !== lastText) {
        lastText = cur;
        stableTicks = 0;
      } else {
        stableTicks++;
      }

      // 串流停止後、內文穩定數拍即收筆；沒抓到串流則靠穩定判斷
      const done = !streaming && (sawStreaming ? stableTicks >= 3 : stableTicks >= 8);
      if (done) return finish(timer, waiting, lastText);
      if (ticks > 400) return finish(timer, waiting, lastText); // 上限約 2 分鐘
    }, 300);
    activeResponseTimer = timer; // 記住目前的輪詢，換頁時可清除
  }

  function finish(timer, waiting, text) {
    clearInterval(timer);
    if (timer === activeResponseTimer) activeResponseTimer = null;
    if (waiting) waiting.remove();
    const after = () => {
      busy = false;
      if (queued.length) return startTurn(queued.shift()); // 還有排隊 → 送下一則（已先顯示過）
      const pen = overlay && overlay.querySelector("#rd-pen");
      if (pen) {
        pen.placeholder = PEN_PLACEHOLDER; // 全部回完 → 還原提示
        // sendToClaude 期間焦點被移到底層 ProseMirror；回完後搶回日記輸入框，
        // 否則使用者後續輸入會打進隱藏的 Claude 編輯器（看不到，且 Enter 可能誤送）
        pen.focus();
      }
    };
    ink(text || "（這次紙頁沒有回音……再試一次？）", "rd-diary", after);
  }
})();
