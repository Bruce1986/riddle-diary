// 墨水日記 · Ink Diary — content script
// 在支援的 AI 對話平台（Claude / ChatGPT / Gemini）上蓋一層日記介面，並橋接到底層真正的對話。
(function () {
  "use strict";

  // ── 平台設定（由 platforms/registry.cjs + 各平台檔在本腳本前載入） ──
  // ── i18n（由 i18n/messages.cjs + i18n/i18n.cjs 在本腳本前載入） ──
  // manifest content_scripts.js 載入順序：
  //   registry.cjs → platforms/claude.cjs → platforms/chatgpt.cjs → platforms/gemini.cjs → i18n/messages.cjs → i18n/i18n.cjs → content.js
  const PLATFORM =
    globalThis.RiddleDiary &&
    typeof globalThis.RiddleDiary.selectPlatform === "function"
      ? globalThis.RiddleDiary.selectPlatform(location.hostname)
      : null;
  // 非已知平台、或平台設定不完整（缺必要選擇器/路徑判斷）→ 不啟用覆蓋層，
  // 避免後續存取缺漏屬性而丟 TypeError 讓 content script 崩潰。
  if (
    !PLATFORM ||
    typeof PLATFORM.selectors !== "object" ||
    PLATFORM.selectors === null ||
    typeof PLATFORM.isOverlayPath !== "function" ||
    typeof PLATFORM.isExistingConversationPath !== "function"
  ) {
    return;
  }

  // i18n helper（messages.js + i18n.js 注入後掛在 globalThis.RiddleDiary.i18n）
  const _i18n = (globalThis.RiddleDiary && globalThis.RiddleDiary.i18n) || null;
  function t(key) {
    return _i18n && typeof _i18n.getMessage === "function"
      ? _i18n.getMessage(key)
      : key; // fallback：直接顯示 key（測試環境 / i18n 未載入時保底）
  }
  // HTML attribute 跳脫（用於 innerHTML template 的 title="..." 等 attribute 上下文）
  const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // HTML text-content 跳脫（用於 innerHTML template 的 >text< 上下文，防禦性寫法）
  const escText = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // 只接受同源 https 路徑，防止 javascript:/data: 等 sink（用於 window.location.href 賦值）
  function safeSameOriginPath(raw) {
    try {
      const u = new URL(raw, location.origin);
      if (u.origin === location.origin && u.protocol === "https:") {
        return u.pathname + u.search + u.hash;
      }
    } catch (_e) {
      /* ignore */
    }
    return null;
  }

  // ── 可維護的選擇器 ──────────────────────────────────────────────
  const SELECTORS = PLATFORM.selectors;

  // PERSONA：優先使用 personaLocales（雙語物件），沒有則退回 persona 字串。
  // 實際取用時呼叫 getPersona()，使其依當下語言動態選取。
  function getPersona() {
    const locales = PLATFORM.personaLocales;
    if (locales && typeof locales === "object") {
      const locale = _i18n && typeof _i18n.getLocale === "function"
        ? _i18n.getLocale()
        : "zh_TW";
      return locales[locale] || locales.zh_TW || PLATFORM.persona || "";
    }
    return PLATFORM.persona || "";
  }

  let bootComplete = false; // boot() 完成後設為 true；防止 storage.onChanged 在初始化前觸發重渲染
  let state = { enabled: true, persona: true };
  let personaSent = false; // 每次載入只在第一則訊息前置人設
  let busy = false;
  const queued = []; // busy 時按 Enter 的訊息佇列，本回合結束後依序送出
  let overlay = null;
  let fontsInjected = false;
  // 進行中的計時器（換頁時需清除，避免舊對話的回應/輪詢寫進新對話）
  let activeResponseTimer = null; // watchResponse 的輪詢
  let introPoll = null; // startIntro 的訊息輪詢
  let reloadTimer = null; // SPA 換頁後延遲重載
  let urlWatchId = null; // watchUrlChanges 的輪詢（模組作用域，resetState 可清除）
  let rdTextHolder = null; // cleanText 重複使用的離畫面隱藏容器（避免每次建立/移除）

  // ── [data-i18n] 重新套用機制 ────────────────────────────────────
  // buildOverlay() 建立的 DOM 元素帶有 data-i18n 屬性，記錄需更新的字串鍵。
  // applyI18n() 遍歷所有帶有 data-i18n 的元素，重新套用目前語言的字串。
  function applyI18n() {
    if (!overlay) return;
    overlay.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      var attr = el.getAttribute("data-i18n-attr"); // 特定 attribute（如 aria-label、title、placeholder）
      if (attr) {
        el.setAttribute(attr, t(key));
      } else {
        el.textContent = t(key);
      }
    });
    // 更新 title tooltips（buildOverlay 時以 data-i18n-title 記錄鍵，語言切換時重新套用）
    overlay.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-title");
      var val = t(key);
      if (val) el.setAttribute("title", val);
    });
    // placeholder 由 data-i18n-attr="placeholder" 處理（見 buildOverlay 中的 textarea）
  }

  // ── 語言變更時的 re-render ──────────────────────────────────────
  // storage.onChanged 偵測到 language 變更 → 更新內部 locale → 重新套用 UI 字串。
  // 注意：正在動畫浮現的墨痕（ink()）不回頭改；只更新靜態 DOM 元素（按鈕、提示等）。
  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== "sync") return;
      // ── 既有的 rd_enabled / rd_persona 監聽 ──
      // boot() 未完成前不觸發 UI 動作（避免 initLocale 未 resolve、overlay 未建）；但仍要繼續往下處理
      // 同一批可能捎帶的 rd_persona / language 變更，避免整批被吞掉。
      if (changes.rd_enabled) {
        state.enabled = changes.rd_enabled.newValue;
        if (bootComplete) {
          if (state.enabled) {
            if (!overlay) {
              if (onOverlayPath()) buildOverlay();
            } else {
              overlay.classList.remove("rd-hidden");
              lastUrl = location.href;
              resetState();
              const feed = overlay.querySelector("#rd-feed");
              if (feed) feed.innerHTML = "";
              startIntro();
              watchUrlChanges(); // resetState 清了 urlWatchId，必須重啟才能繼續偵測 SPA 換頁
            }
          } else if (overlay) {
            overlay.classList.add("rd-hidden");
            resetState();
          }
        }
      }
      if (changes.rd_persona) state.persona = changes.rd_persona.newValue;

      // ── 語言偏好變更 ──
      // 需等 boot() 完成（initLocale 已 resolve），否則 setLocale 會被 initLocale 完成時的回呼覆寫。
      if (changes.language && _i18n && bootComplete) {
        var uiLang = "";
        try {
          uiLang =
            typeof chrome.i18n !== "undefined" &&
            typeof chrome.i18n.getUILanguage === "function"
              ? chrome.i18n.getUILanguage()
              : (navigator && navigator.language) || "";
        } catch (e) {
          uiLang = (navigator && navigator.language) || "";
        }
        if (typeof _i18n.setLocale === "function" && typeof _i18n.resolveLocale === "function") {
          _i18n.setLocale(_i18n.resolveLocale(changes.language.newValue, uiLang));
        }
        applyI18n();
        // pen placeholder 需單獨更新（因為它不是 textContent，而是 placeholder 屬性）
        const pen = overlay && overlay.querySelector("#rd-pen");
        if (pen) {
          pen.placeholder = busy ? t("pen_placeholder_busy") : t("pen_placeholder");
        }
      }
    });
  } catch (e) {
    /* context 失效，略過監聽 */
  }

  // 只在「對話相關」頁面顯示日記，避免蓋住登入頁、設定頁等
  function onOverlayPath() {
    return PLATFORM.isOverlayPath(location.pathname);
  }

  // 兩個字型都打包在擴充內，以 chrome-extension:// URL 注入 @font-face，完全不對外連線，
  // 也繞過各 AI 平台的 CSP `font-src` 限制（白名單多半不含外部 CDN）。
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

  // ── 啟動：先初始化語言，再讀其餘設定 ────────────────────────────
  function boot() {
    safeStorageGet({ rd_enabled: true, rd_persona: true }, function (cfg) {
      state.enabled = cfg.rd_enabled;
      state.persona = cfg.rd_persona;
      if (state.enabled && onOverlayPath()) buildOverlay();
      bootComplete = true; // 初始化完成，允許 storage.onChanged 觸發重渲染
    });
  }

  // 初始化 locale，然後啟動覆蓋層
  if (_i18n && typeof _i18n.initLocale === "function") {
    _i18n.initLocale(function () { boot(); });
  } else {
    boot();
  }

  // 統一清除所有進行中的計時器並重置狀態（換頁／闔上／停用時呼叫，避免背景計時器空轉）
  function resetState() {
    if (activeResponseTimer) { clearInterval(activeResponseTimer); activeResponseTimer = null; }
    if (introPoll) { clearInterval(introPoll); introPoll = null; }
    if (reloadTimer) { clearTimeout(reloadTimer); reloadTimer = null; }
    if (urlWatchId) { clearInterval(urlWatchId); urlWatchId = null; }
    busy = false;
    queued.length = 0;
    const pen = overlay && overlay.querySelector("#rd-pen");
    if (pen) pen.placeholder = t("pen_placeholder");
  }

  // 監看 SPA 換頁：各 AI 對話平台在側邊欄切換對話多半不會重整頁面，
  // content script 在隔離世界攔不到頁面的 history.pushState，故以輪詢 location.href 偵測。
  let lastUrl = location.href;
  function watchUrlChanges() {
    // 清除舊的輪詢再重新啟動，避免多重呼叫造成並行輪詢
    if (urlWatchId) { clearInterval(urlWatchId); urlWatchId = null; }
    urlWatchId = setInterval(() => {
      if (!extValid()) { clearInterval(urlWatchId); urlWatchId = null; return; } // 擴充重載後舊分頁 context 失效 → 停掉輪詢
      if (location.href === lastUrl) return;
      lastUrl = location.href; // 隨時更新；隱藏時切換對話的重載改由「重新啟用」時主動處理
      if (!overlay || overlay.classList.contains("rd-hidden")) return;
      // 換對話了 → 先明確停掉目前這支 interval（防止 resetState 被呼叫後 ID 已被清空
      // 但 setInterval 回呼仍持續觸發的競態），再統一重置並重新啟動監聽。
      clearInterval(urlWatchId);
      urlWatchId = null;
      resetState();
      personaSent = false; // 新對話要重新前置人設
      overlay.classList.remove("rd-hist-open");
      const feed = overlay.querySelector("#rd-feed");
      if (feed) feed.innerHTML = "";
      reloadTimer = setTimeout(startIntro, 500); // 給 AI 平台換上新對話內容的時間
      watchUrlChanges(); // 重新啟動 URL 監聽，確保 SPA 後續換頁仍可偵測
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
    injectFonts();
    overlay = document.createElement("div");
    overlay.id = "rd-overlay";
    // 使用 data-i18n 屬性標記需要翻譯的元素，applyI18n() 會遍歷套用。
    // data-i18n-attr 指定要更新的 attribute（預設更新 textContent）。
    overlay.innerHTML = `
      <div id="rd-book">
        <div id="rd-bookmark" role="button" tabindex="0"
          data-i18n="bookmark_aria" data-i18n-attr="aria-label"
          data-i18n-title="bookmark_aria"
          title="${escAttr(t("bookmark_aria"))}">
          <span data-i18n="bookmark_label">${escText(t("bookmark_label"))}</span>
        </div>

        <aside id="rd-history">
          <div class="rd-hist-head">
            <span data-i18n="history_head">${escText(t("history_head"))}</span>
            <button id="rd-hist-close" data-i18n-title="history_close" title="${escAttr(t("history_close"))}">
              <span data-i18n="history_close">${escText(t("history_close"))}</span>
            </button>
          </div>
          <button id="rd-new" data-i18n-title="open_new_page" title="${escAttr(t("open_new_page"))}">
            <span data-i18n="open_new_page">${escText(t("open_new_page"))}</span>
          </button>
          <div class="rd-hist-list"></div>
        </aside>

        <div class="rd-corner">
          <button id="rd-peek" data-i18n-title="peek_button" title="${escAttr(t("peek_button"))}">
            <span data-i18n="peek_button">${escText(t("peek_button"))}</span>
          </button>
          <button id="rd-close" data-i18n-title="close_button" title="${escAttr(t("close_button"))}">
            <span data-i18n="close_button">${escText(t("close_button"))}</span>
          </button>
        </div>

        <div id="rd-feed"></div>
        <textarea id="rd-pen" rows="1"
          placeholder="${escAttr(t("pen_placeholder"))}"
          data-i18n="pen_placeholder" data-i18n-attr="placeholder"></textarea>
        <div id="rd-caption" data-i18n="caption">${escText(t("caption"))}</div>

        <div id="rd-cover" role="button" tabindex="0"
          data-i18n="cover_hint" data-i18n-attr="aria-label"
          aria-label="${escAttr(t("cover_hint"))}">
          <div class="rd-cover-frame">
            <div class="rd-cover-title" data-i18n="cover_title">${escText(t("cover_title"))}</div>
            <div class="rd-cover-rule"></div>
            <div class="rd-cover-sub" data-i18n="cover_sub">${escText(t("cover_sub"))}</div>
            <div class="rd-cover-hint" data-i18n="cover_hint">${escText(t("cover_hint"))}</div>
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
    onActivate(bookmark, () => toggleHistory());
    overlay.querySelector("#rd-hist-close").addEventListener("click", () => toggleHistory(false));
    overlay.querySelector("#rd-new").addEventListener("click", () => {
      // 驗證 platform 提供的 newChatPath 為同源 https 相對路徑，防 javascript:/data: sink
      const safe = safeSameOriginPath(PLATFORM.newChatPath || "/new") || "/new";
      sessionStorage.setItem("rd_skipcover", "1");
      window.location.href = safe;
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
    if (introPoll) { clearInterval(introPoll); introPoll = null; } // 避免並行輪詢
    // 在既有對話頁 → 等訊息載入後，把整段對話鋪進日記；否則顯示開場白
    if (PLATFORM.isExistingConversationPath(location.pathname)) {
      let tries = 0;
      introPoll = setInterval(() => {
        if (!extValid()) { clearInterval(introPoll); introPoll = null; return; } // 孤立腳本自我銷毀
        tries++;
        const nodes = document.querySelectorAll(
          SELECTORS.userMsg + "," + SELECTORS.response
        );
        if (nodes.length) {
          clearInterval(introPoll);
          introPoll = null;
          renderExisting(nodes);
          if (pen) pen.focus();
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
    ink(t("intro_line"), "rd-diary", () => pen && pen.focus());
  }

  // 把既有對話的訊息「立即」鋪進日記（不逐字動畫）。用 DocumentFragment 一次掛上，避免逐行重排。
  function renderExisting(nodes) {
    const feed = overlay.querySelector("#rd-feed");
    feed.innerHTML = "";
    const frag = document.createDocumentFragment();
    nodes.forEach((node) => {
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
    if (!anchors.length && SELECTORS.historyItemFallback) {
      anchors = document.querySelectorAll(SELECTORS.historyItemFallback);
    }
    anchors.forEach((a) => {
      const href = a.getAttribute("href");
      if (!href || seen.has(href)) return;
      // 標題：優先 title 屬性；否則 clone 後剝掉 hover 選單按鈕/SVG/無障礙複本再取文字，
      // 避免抓到「我的對話 重新命名 刪除 分享」之類的雜訊
      let title = (a.getAttribute("title") || "").replace(/\s+/g, " ").trim();
      if (!title) {
        const c = a.cloneNode(true);
        c.querySelectorAll(SELECTORS.noise + ", svg").forEach((el) => el.remove());
        title = (c.innerText || c.textContent || "").replace(/\s+/g, " ").trim();
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
        let live = null;
        try {
          live =
            document.querySelector('a[href="' + CSS.escape(href) + '"]') ||
            (a.isConnected ? a : null);
        } catch (_e) {
          live = a.isConnected ? a : null;
        }
        if (live) {
          live.click(); // SPA 軟導航
        } else {
          // 找不到可用錨點 → 退回 hard reload；驗證 href 為同源絕對路徑，
          // 防止 host 頁面若曾嵌 javascript:/data: 連結被誤導。
          const safe = safeSameOriginPath(href);
          if (safe) {
            sessionStorage.setItem("rd_skipcover", "1");
            window.location.href = safe;
          }
        }
      });
      list.appendChild(item);
      count++;
    });
    if (count === 0) {
      const empty = document.createElement("div");
      empty.className = "rd-hist-empty";
      empty.textContent = t("history_empty");
      list.replaceChildren(empty);
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
      if (!line.isConnected) return; // 節點已被移除（如換頁清空 feed）→ 停止，避免孤兒計時器
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

  // 取得目前所有「助理回覆」節點。
  function responseNodes() {
    return document.querySelectorAll(SELECTORS.response);
  }

  // 擷取節點的乾淨內文：剔除無障礙標籤、按鈕、思考區塊
  function cleanText(node) {
    if (!node) return "";
    const clone = node.cloneNode(true);
    clone.querySelectorAll(SELECTORS.noise).forEach((el) => el.remove());
    if (!rdTextHolder || !rdTextHolder.isConnected) {
      rdTextHolder = document.getElementById("rd-text-holder");
      if (!rdTextHolder) {
        rdTextHolder = document.createElement("div");
        rdTextHolder.id = "rd-text-holder";
        rdTextHolder.style.cssText =
          "position:absolute;left:-99999px;top:0;width:640px;visibility:hidden;white-space:pre-wrap;";
        document.documentElement.appendChild(rdTextHolder);
      }
    }
    rdTextHolder.replaceChildren(clone);
    let text = (clone.innerText || "").replace(/ /g, " ").trim();
    rdTextHolder.replaceChildren();
    text = text.replace(/^(Claude|ChatGPT|Gemini|Assistant|Model)\s+(responded|said)\s*:?\s*|^You\s+said\s*:?\s*/i, "");
    return text;
  }
  function latestResponseText() {
    const nodes = responseNodes();
    return cleanText(nodes[nodes.length - 1]);
  }

  // ── 送出 + 接收 ─────────────────────────────────────────────────
  function submit(raw) {
    const pen = overlay.querySelector("#rd-pen");
    const text = (raw || "").trim();
    pen.value = "";
    pen.style.height = "auto";
    if (!text) return;
    if (!document.querySelector(SELECTORS.editor)) {
      ink(t("no_editor"), "rd-diary");
      return;
    }
    if (busy) {
      queued.push(text);
      return;
    }
    startTurn(text);
  }

  function startTurn(text) {
    busy = true;
    const pen = overlay.querySelector("#rd-pen");
    if (pen) pen.placeholder = t("pen_placeholder_busy");
    ink(text, "rd-me");
    let toSend = text;
    if (state.persona && !personaSent) {
      toSend = getPersona() + text;
      personaSent = true;
    }
    const baseline = responseNodes().length;
    const prev = latestResponseText();
    if (sendToClaude(toSend)) {
      watchResponse(baseline, prev);
    } else if (pen) {
      pen.placeholder = t("pen_placeholder");
    }
  }

  function sendToClaude(text) {
    // TODO(T4-E): Gemini uses Quill; execCommand("insertText") may or may not work.
    // LIVE VERIFY before releasing Gemini support.
    if (PLATFORM.writeStrategy === "quill" && typeof console !== "undefined") {
      console.warn("[Ink Diary] Gemini uses Quill; write may fail. TODO(T4-E)");
    }
    const ed = document.querySelector(SELECTORS.editor);
    if (!ed) {
      ink(t("no_editor"), "rd-diary", () => { busy = false; });
      return false;
    }
    ed.focus();
    let inserted = false;
    try {
      document.execCommand("selectAll", false, null);
      inserted = document.execCommand("insertText", false, text);
    } catch (e) {
      inserted = false;
    }
    if (!inserted) {
      ed.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: text,
        })
      );
    }
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
    return true;
  }

  function watchResponse(baseline, prev) {
    let ticks = 0;
    let sawStreaming = false;
    let appeared = false;
    let lastText = "";
    let stableTicks = 0;

    const waiting = ink(t("ink_waiting"), "rd-diary");

    const timer = setInterval(() => {
      if (!extValid()) {
        clearInterval(timer);
        if (timer === activeResponseTimer) activeResponseTimer = null;
        return;
      }
      ticks++;
      const streaming = !!document.querySelector(SELECTORS.stopBtn);
      if (streaming) sawStreaming = true;

      if (!appeared) {
        if (responseNodes().length > baseline || streaming) appeared = true;
        else if (ticks > 120) return finish(timer, waiting, null);
        else return;
      }

      const cur = latestResponseText();
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

      const done = !streaming && (sawStreaming ? stableTicks >= 3 : stableTicks >= 8);
      if (done) return finish(timer, waiting, lastText);
      if (ticks > 400) return finish(timer, waiting, lastText);
    }, 300);
    activeResponseTimer = timer;
  }

  function finish(timer, waiting, text) {
    clearInterval(timer);
    if (timer === activeResponseTimer) activeResponseTimer = null;
    if (waiting) waiting.remove();
    const after = () => {
      busy = false;
      if (queued.length) return startTurn(queued.shift());
      const pen = overlay && overlay.querySelector("#rd-pen");
      if (pen) pen.placeholder = t("pen_placeholder");
    };
    ink(text || t("no_echo"), "rd-diary", after);
  }
})();
