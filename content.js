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

  let state = { enabled: true, persona: true };
  let personaSent = false; // 每次載入只在第一則訊息前置人設
  let busy = false;
  let queued = null; // busy 時按 Enter 的訊息，等本回合結束再送
  let overlay = null;
  let fontsInjected = false;

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
    if (state.enabled) buildOverlay();
  });

  try {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.rd_enabled) {
        state.enabled = changes.rd_enabled.newValue;
        if (state.enabled) {
          if (!overlay) buildOverlay();
          else overlay.classList.remove("rd-hidden");
        } else if (overlay) {
          overlay.classList.add("rd-hidden");
        }
      }
      if (changes.rd_persona) state.persona = changes.rd_persona.newValue;
    });
  } catch (e) {
    /* context 失效，略過監聽 */
  }

  // ── 介面 ────────────────────────────────────────────────────────
  function buildOverlay() {
    if (overlay) return;
    injectFonts();
    overlay = document.createElement("div");
    overlay.id = "rd-overlay";
    overlay.innerHTML = `
      <div id="rd-book">
        <div id="rd-bookmark" title="翻開左側的歷史篇章"><span>書籤</span></div>

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

        <div id="rd-cover">
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
      safeStorageSet({ rd_enabled: false }); // 盡力持久化（context 失效時略過）
    });

    // 「窺視」：按住可看底層 Claude，放開即恢復。
    // 放開事件必須掛在 window —— overlay 被設成 visibility:hidden 後，按鈕本身收不到 pointerup。
    const peek = overlay.querySelector("#rd-peek");
    peek.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      overlay.style.visibility = "hidden";
      const restore = () => (overlay.style.visibility = "visible");
      window.addEventListener("pointerup", restore, { once: true });
      window.addEventListener("pointercancel", restore, { once: true });
    });

    // 書籤 ↔ 歷史面板
    const bookmark = overlay.querySelector("#rd-bookmark");
    bookmark.addEventListener("click", () => toggleHistory());
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
      cover.addEventListener("click", openBook);
    }
  }

  // ── 啟動書封動畫 ────────────────────────────────────────────────
  function openBook() {
    const cover = overlay.querySelector("#rd-cover");
    if (!cover) return startIntro();
    cover.classList.add("rd-open");
    setTimeout(() => {
      cover.remove();
      startIntro();
    }, 900);
  }

  function startIntro() {
    const pen = overlay.querySelector("#rd-pen");
    // 在既有對話頁 → 等訊息載入後，把整段對話鋪進日記；否則顯示開場白
    if (/^\/chat\//.test(location.pathname)) {
      let tries = 0;
      const poll = setInterval(() => {
        tries++;
        const nodes = document.querySelectorAll(
          SELECTORS.userMsg + "," + SELECTORS.response
        );
        if (nodes.length) {
          clearInterval(poll);
          renderExisting(nodes);
          if (pen) pen.focus();
        } else if (tries > 16) {
          clearInterval(poll);
          showIntroLine(pen); // 約 5 秒仍無訊息 → 當作空白頁
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

  // 把既有對話的訊息「立即」鋪進日記（不逐字動畫）
  function renderExisting(nodes) {
    const feed = overlay.querySelector("#rd-feed");
    feed.innerHTML = "";
    nodes.forEach((node) => {
      const isUser = node.matches(SELECTORS.userMsg);
      const text = cleanText(node);
      if (text) inkStatic(text, isUser ? "rd-me" : "rd-diary");
    });
  }

  // 立即顯示一行（既有對話用，無浮現動畫）
  function inkStatic(text, cls) {
    const feed = overlay.querySelector("#rd-feed");
    const line = document.createElement("div");
    line.className = "rd-line " + cls;
    line.textContent = text;
    feed.appendChild(line);
    feed.scrollTop = feed.scrollHeight;
    return line;
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
      // 標題：優先 title 屬性，否則內文；壓成單行
      let title = (a.getAttribute("title") || a.innerText || a.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!title) return;
      // 去除 claude 側邊欄「標題重複兩次」（可見 + 無障礙複本，中間可能夾空白）
      const dup = title.match(/^(.{2,}?)\s*\1$/);
      if (dup) title = dup[1].trim();
      if (title.length > 40) title = title.slice(0, 40) + "…";
      seen.add(href);
      const item = document.createElement("button");
      item.className = "rd-hist-item";
      item.textContent = title;
      item.title = title;
      item.addEventListener("click", () => {
        sessionStorage.setItem("rd_skipcover", "1");
        window.location.href = href;
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
    let i = 0;
    (function reveal() {
      if (i < spans.length) {
        spans[i].style.opacity = 1;
        i++;
        feed.scrollTop = feed.scrollHeight;
        setTimeout(reveal, step);
      } else if (done) {
        setTimeout(done, 400);
      }
    })();
    return line;
  }

  // 取得目前所有「助理回覆」節點（依序退而求其次）
  function responseNodes() {
    for (const sel of SELECTORS.response.split(",")) {
      const found = document.querySelectorAll(sel.trim());
      if (found.length) return found;
    }
    return [];
  }

  // 擷取節點的乾淨內文：剔除無障礙標籤、按鈕、思考區塊
  function cleanText(node) {
    if (!node) return "";
    const clone = node.cloneNode(true);
    clone.querySelectorAll(SELECTORS.noise).forEach((el) => el.remove());
    let t = (clone.innerText || "").replace(/ /g, " ").trim();
    // 去掉開頭可能殘留的無障礙標籤
    t = t.replace(/^(Claude\s+(responded|said)|You\s+said)\s*:?\s*/i, "");
    // 去除「整段恰好重複兩次」（少數無障礙複本）
    const dup = t.match(/^([\s\S]{2,}?)\s*\1$/);
    if (dup) t = dup[1].trim();
    return t;
  }
  function latestResponseText() {
    const nodes = responseNodes();
    return cleanText(nodes[nodes.length - 1]);
  }

  // ── 送出 + 接收 ─────────────────────────────────────────────────
  function submit(raw) {
    const text = (raw || "").trim();
    if (!text) return;
    const pen = overlay.querySelector("#rd-pen");
    pen.value = "";
    pen.style.height = "auto";
    if (busy) {
      // 上一回合還在進行 → 排隊，輸入框照樣清空，結束後自動接著送
      queued = text;
      return;
    }
    busy = true;

    ink(text, "rd-me", () => {
      let toSend = text;
      if (state.persona && !personaSent) {
        toSend = PERSONA + text;
        personaSent = true;
      }
      const baseline = responseNodes().length;
      const prev = latestResponseText();
      if (sendToClaude(toSend)) watchResponse(baseline, prev);
    });
  }

  function sendToClaude(text) {
    const ed = document.querySelector(SELECTORS.editor);
    if (!ed) {
      ink("（紙頁無法與底下的墨池相連…請確認頁面已開啟一個對話）", "rd-diary", () => {
        busy = false;
      });
      return false;
    }
    ed.focus();
    // 用 execCommand 寫入 contenteditable，可觸發 React 監聽的 input 事件
    try {
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, text);
    } catch (e) {
      ed.textContent = text;
      ed.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
    setTimeout(() => {
      const btn = document.querySelector(SELECTORS.sendBtn);
      if (btn && !btn.disabled) {
        btn.click();
      } else {
        ["keydown", "keyup"].forEach((type) =>
          ed.dispatchEvent(
            new KeyboardEvent(type, {
              key: "Enter",
              code: "Enter",
              keyCode: 13,
              which: 13,
              bubbles: true,
            })
          )
        );
      }
    }, 120);
    // 回傳 true = 已「嘗試」送出（找得到輸入框）。實際送出在 setTimeout 內非同步進行；
    // 若送出鈕缺失/停用且 Enter fallback 也沒觸發，watchResponse 會在約 36 秒無回應後
    // 顯示「沒有回音」並解鎖 —— 這是刻意的優雅降級，無法從外部即時確認 Claude 是否收到。
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
  }

  function finish(timer, waiting, text) {
    clearInterval(timer);
    if (waiting) waiting.remove();
    const after = () => {
      busy = false;
      if (queued) {
        const q = queued;
        queued = null;
        submit(q); // 送出排隊中的訊息
      }
    };
    ink(text || "（這次紙頁沒有回音……再試一次？）", "rd-diary", after);
  }
})();
