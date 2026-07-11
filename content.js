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
  let openBookTimer = null; // 開書動畫的計時器：防連點重複 startIntro，resetState 一併清
  let trackStreamingTimer = null; // 載入串流中對話的追蹤輪詢（獨立於 activeResponseTimer，避免互清）
  // 上次渲染的 DOM 節點實例集合，用於偵測 SPA 換頁是否已換新：比字串指紋更精準——
  // 即使新舊對話文字完全相同，React 重掛載出的也是全新節點實例，故能「零延遲」分辨。
  let lastRenderedNodes = new Set();
  let rdTextHolder = null; // cleanText 重複使用的離畫面隱藏容器（避免每次建立/移除）

  // ── [data-i18n] 重新套用機制 ────────────────────────────────────
  // buildOverlay() 建立的 DOM 元素帶有 data-i18n 屬性，記錄需更新的字串鍵。
  // applyI18n() 遍歷所有帶有 data-i18n 的元素，重新套用目前語言的字串。
  function applyI18n() {
    if (overlay) {
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
    // 翻回按鈕在 overlay 之外，需單獨刷新語言字串
    const rb = document.getElementById("rd-reopen");
    if (rb) {
      const label = t("reopen_hint");
      rb.title = label;
      rb.setAttribute("aria-label", label);
    }
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
            } else if (onOverlayPath()) { // 非對話頁則維持隱藏，不蓋住頁面
              overlay.classList.remove("rd-hidden");
              lastUrl = location.href;
              lastRenderedNodes.clear(); // 重新啟用即是要立刻鋪上目前對話，不必等節點換新
              resetState();
              const feed = overlay.querySelector("#rd-feed");
              if (feed) feed.innerHTML = "";
              startIntro();
              watchUrlChanges(); // resetState 清了 urlWatchId，必須重啟才能繼續偵測 SPA 換頁
            }
          } else if (overlay) {
            overlay.classList.add("rd-hidden");
            resetState();
            watchUrlChanges(); // resetState 清了 urlWatchId：停用期間仍要監看路由，翻回按鈕才會跟著顯示/隱藏
          }
          if (!state.enabled) ensureReopenButton(); // 停用時保證按鈕存在
          updateReopenVisibility(); // 依 overlay 狀態顯示/隱藏翻回按鈕
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
    const staleFont = document.getElementById("rd-fontface"); // 擴充重載殘留的舊字型樣式 → 先清
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

  // ── 翻回日記按鈕（overlay 隱藏 / 停用時的浮動入口） ─────────────────
  // 刻意 append 到 documentElement（在 overlay 之外），這樣 overlay 被
  // rd-hidden 隱藏時，此按鈕仍可見；overlay 顯示時由 updateReopenVisibility 隱藏。
  let reopenBtn = null; // 本世代建立的翻回按鈕；getElementById 撈得到但此變數為 null＝擴充重載前的殘留
  function ensureReopenButton() {
    if (reopenBtn && reopenBtn.isConnected) return reopenBtn;
    // 擴充重載後殘留的舊按鈕：click handler 綁在已死世代的 closure（extValid()=false、
    // safeStorageSet 靜默 no-op），按了沒反應——比照 #rd-overlay/#rd-fontface 先清再重建。
    const stale = document.getElementById("rd-reopen");
    if (stale) stale.remove();
    let btn = document.createElement("button");
    btn.id = "rd-reopen";
    btn.setAttribute("data-i18n-title", "reopen_hint");
    btn.setAttribute("data-i18n", "reopen_hint");
    btn.setAttribute("data-i18n-attr", "aria-label");
    btn.title = t("reopen_hint");
    btn.setAttribute("aria-label", t("reopen_hint"));
    try {
      btn.style.backgroundImage =
        "url(\"" + chrome.runtime.getURL("icons/icon-48.png") + "\")";
    } catch (_e) {
      /* context 失效：退回無圖背景（純皮革色由 CSS box-shadow 撐起可視性） */
    }
    btn.addEventListener("click", function () {
      state.enabled = true;
      safeStorageSet({ rd_enabled: true });
      if (!overlay) {
        if (onOverlayPath()) buildOverlay();
      } else if (onOverlayPath()) { // 非對話頁不重現（stale 按鈕不得把 overlay 蓋到設定頁上）
        overlay.classList.remove("rd-hidden");
        lastUrl = location.href;
        lastRenderedNodes.clear(); // 翻回即是要立刻鋪上目前對話，不必等節點換新
        resetState();
        const feed = overlay.querySelector("#rd-feed");
        if (feed) feed.innerHTML = "";
        startIntro();
        watchUrlChanges();
      }
      updateReopenVisibility();
    });
    document.documentElement.appendChild(btn);
    reopenBtn = btn;
    return btn;
  }
  function updateReopenVisibility() {
    const btn = document.getElementById("rd-reopen");
    if (!btn) return;
    const overlayHidden = !overlay || overlay.classList.contains("rd-hidden");
    const shouldShow = overlayHidden && onOverlayPath();
    btn.classList.toggle("rd-visible", shouldShow);
  }

  // ── 啟動：先初始化語言，再讀其餘設定 ────────────────────────────
  function boot() {
    safeStorageGet({ rd_enabled: true, rd_persona: true }, function (cfg) {
      state.enabled = cfg.rd_enabled;
      state.persona = cfg.rd_persona;
      if (state.enabled && onOverlayPath()) {
        buildOverlay();
      } else if (!state.enabled && onOverlayPath()) {
        // 使用者上次闔上了日記，但仍在支援站台 → 顯示翻回按鈕
        ensureReopenButton();
        updateReopenVisibility();
      }
      // 不論初始路由為何都立刻開始監看 SPA 換頁：否則初次落在非對話頁（如 /settings）時
      // buildOverlay 不會被呼叫、監看永不啟動，導航回對話頁就再也建不起日記。
      watchUrlChanges();
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
    if (openBookTimer) { clearTimeout(openBookTimer); openBookTimer = null; }
    if (trackStreamingTimer) { clearInterval(trackStreamingTimer); trackStreamingTimer = null; }
    if (urlWatchId) { clearInterval(urlWatchId); urlWatchId = null; }
    // Gemini-review: 刻意「不」在此無條件清 lastRenderedNodes。chat→chat 切換時 resetState 會先跑，
    // 清掉會讓 staleness 偵測失效；只有停用/闔上（enabled=false）時才清，重新翻回不必等節點換新。
    if (!state.enabled) lastRenderedNodes.clear();
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
      const oldUrl = lastUrl;
      lastUrl = location.href; // 隨時更新；隱藏時切換對話的重載改由「重新啟用」時主動處理
      // 初次落在非 overlay 路由時 overlay 尚未建立；導航進 overlay 路由就在此補建
      // （監看已於 boot() 無條件開跑），與 boot() 的分支語意一致。
      if (!overlay) {
        if (state.enabled && onOverlayPath()) {
          buildOverlay();
        } else if (!state.enabled && onOverlayPath()) {
          ensureReopenButton();
          updateReopenVisibility();
        }
        return;
      }
      // 離開對話頁（去 /new、/、/settings…）→ 清掉上次節點集合，釋放對 detached 節點的參照。
      // 對話→對話直接切換時目的地仍是對話頁，不會清，stale 偵測照常運作。
      if (!PLATFORM.isExistingConversationPath(location.pathname)) lastRenderedNodes.clear();
      // 導航到非 overlay 頁（/settings、/login…）→ 隱藏日記，別蓋住頁面
      if (!onOverlayPath()) {
        if (!overlay.classList.contains("rd-hidden")) {
          overlay.classList.add("rd-hidden");
          resetState(); // 清背景計時器（urlWatchId 一併被清）→ 立刻重啟監看
          watchUrlChanges();
        }
        updateReopenVisibility();
        return;
      }
      if (overlay.classList.contains("rd-hidden")) {
        // 使用者主動闔上（enabled=false）→ 保持隱藏，重載交由「翻回」按鈕處理
        if (!state.enabled) {
          updateReopenVisibility(); // 闔上狀態下換頁：翻回按鈕跟著路由顯示/隱藏
          return;
        }
        // 先前離開對話頁被自動隱藏（仍 enabled）→ 回到對話頁重新顯示；
        // 不 return：往下走統一重置＋startIntro 重新鋪內容
        overlay.classList.remove("rd-hidden");
        updateReopenVisibility();
      }
      // 送出第一則訊息後，平台會把新對話從 / 或 /new 或 /app 重導到既有對話路徑。
      // 若此時正忙（busy：第一則訊息的動畫/輪詢進行中），不要重置與清空畫面，
      // 否則第一則回應的墨水書寫動畫會被打斷、凍成不再更新的靜態快照。
      let wasNonConvo = true;
      try {
        wasNonConvo = !PLATFORM.isExistingConversationPath(new URL(oldUrl).pathname);
      } catch (e) { /* oldUrl 異常時保守視為非對話頁 */ }
      if (wasNonConvo && PLATFORM.isExistingConversationPath(location.pathname) && busy) {
        return; // 維持同一回合：動畫與 watchResponse 繼續，lastUrl 已更新故不會重觸
      }
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
    // 擴充重載後，舊 content script 的 context 死了但它建立的節點還在頁面上；
    // 新腳本的 overlay 變數為 null，若不先清掉舊節點會重複疊一層、事件重複綁定。
    const stale = document.getElementById("rd-overlay");
    if (stale) stale.remove();
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
      state.enabled = false; // 同步更新，讓 resetState 能據此清掉 lastRenderedNodes（storage 事件是非同步的）
      overlay.classList.add("rd-hidden"); // 直接隱藏，不依賴 storage 事件
      resetState(); // 清掉背景計時器，避免隱藏後還在空轉
      watchUrlChanges(); // resetState 清了 urlWatchId：闔上期間仍要監看路由，翻回按鈕才會跟著顯示/隱藏
      safeStorageSet({ rd_enabled: false }); // 盡力持久化（context 失效時略過）
      ensureReopenButton();
      updateReopenVisibility(); // 顯示翻回日記浮動按鈕
    });

    // 「窺視」：按住可看底層對話頁，放開即恢復。用 opacity:0 + pointer-events:none 隱藏，
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
      // 三個監聽互斥（只會觸發其一），用 once 會殘留另外兩個 → 手動全部移除，避免事件監聽洩漏
      window.removeEventListener("pointerup", peekRestore);
      window.removeEventListener("pointercancel", peekRestore);
      window.removeEventListener("blur", peekRestore);
    };
    peek.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return; // 只允許滑鼠左鍵／觸控；右鍵會跳出選單干擾 pointerup 還原，導致永久隱藏
      e.preventDefault();
      peekShow();
      window.addEventListener("pointerup", peekRestore);
      window.addEventListener("pointercancel", peekRestore);
      // 視窗失焦（切分頁/alt-tab，或在視窗外放開滑鼠）時 pointerup 可能不在 window 觸發 → 一併還原，避免永久隱藏
      window.addEventListener("blur", peekRestore);
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
    if (PLATFORM.isExistingConversationPath(location.pathname)) {
      let tries = 0;
      const MAX_TRIES = 50; // 約 15 秒（300ms × 50）：對話頁必有歷史訊息，放寬以容忍慢速網路
      introPoll = setInterval(() => {
        if (!extValid()) { clearInterval(introPoll); introPoll = null; return; } // 孤立腳本自我銷毀
        tries++;
        const nodes = document.querySelectorAll(
          SELECTORS.userMsg + "," + SELECTORS.response
        );
        // SPA 換對話時，頁面 DOM 可能還殘留上一段對話的訊息；
        // 若當前任一節點仍是「上次渲染過的同一實例」，代表 DOM 尚未換新，繼續等（逾時才放行）。
        const isStale = Array.from(nodes).some((node) => lastRenderedNodes.has(node));
        if (nodes.length && isStale && tries < MAX_TRIES) {
          return;
        }
        if (nodes.length) {
          clearInterval(introPoll);
          introPoll = null;
          renderExisting(nodes);
          if (pen) pen.focus();
          trackIfStreaming(); // 若載入時對話仍在串流，追蹤到完成後重新整段渲染
        } else if (tries > MAX_TRIES) {
          clearInterval(introPoll);
          introPoll = null;
          // 對話頁必有歷史訊息，逾時仍空 = 載入失敗，顯示錯誤而非「空白新日記」開場白
          // （後者會誤導，且歷史訊息真的載入後也無法再鋪進來）。
          ink(t("load_fail"), "rd-diary");
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
    outermost(nodes).forEach((node) => { // 去巢狀，避免容器＋子元素重複渲染
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
    // 記下這次渲染的節點實例，供下次 SPA 換頁時比對 DOM 是否已換新
    lastRenderedNodes = new Set(nodes);
  }

  // 若載入既有對話時平台仍在串流，追蹤到串流結束後「重新整段渲染」（取得最終乾淨內文、避免重複）。
  // 用獨立的 trackStreamingTimer（不與 watchResponse 共用 activeResponseTimer），避免兩者互相覆蓋／誤清；
  // 換頁/闔上時 resetState() 同樣會一併清掉。
  function trackIfStreaming() {
    if (trackStreamingTimer) { clearInterval(trackStreamingTimer); trackStreamingTimer = null; } // 重入保護
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
      // 兩半之間必須有空白（\s+）才視為無障礙重複標題；\s* 會把「哈哈哈哈」誤切成「哈哈」
      const dup = title.match(/^(.{2,}?)\s+\1$/);
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

  // 從節點集合濾掉「被集合內其他節點包含」的內層節點。
  // 因為 SELECTORS.response 的多個選擇器可能同時命中容器與其子元素（querySelectorAll
  // 只會去除「完全相同」的節點，不會去除巢狀），不過濾會造成同一則訊息被算兩次／渲染兩次。
  function outermost(nodeList) {
    const arr = Array.from(nodeList);
    const set = new Set(arr); // 祖先回溯：O(N×深度) 取代兩兩 contains 檢查
    return arr.filter((n) => {
      let p = n.parentNode;
      while (p) {
        if (set.has(p)) return false; // 有祖先也在集合內 → 是內層節點，濾掉
        p = p.parentNode;
      }
      return true;
    });
  }

  // 取得目前所有「助理回覆」節點（已去巢狀）。
  function responseNodes() {
    return outermost(document.querySelectorAll(SELECTORS.response));
  }

  // cleanText 結果快取：streaming 期間每秒被呼叫多次、renderExisting 逐節點呼叫，
  // 以節點實例＋當下 textContent 為鍵，內容沒變就不重跑 clone/reflow。
  const cleanTextCache = new WeakMap();
  // 擷取節點的乾淨內文：剔除無障礙標籤、按鈕、思考區塊
  function cleanText(node) {
    if (!node) return "";
    const srcNow = node.textContent || "";
    const hit = cleanTextCache.get(node);
    if (hit && hit.src === srcNow) return hit.out;
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
    cleanTextCache.set(node, { src: srcNow, out: text });
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
    // 先驗證底層編輯器存在再清空輸入框：頁面異常時保留使用者辛苦打的字，不被吞掉。
    if (text && !document.querySelector(SELECTORS.editor)) {
      ink(t("no_editor"), "rd-diary");
      return;
    }
    pen.value = "";
    pen.style.height = "auto";
    if (!text) return;
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
    } else {
      // 送出失敗：重置 busy 並清掉佇列（否則排隊中的訊息會永遠卡住），還原提示
      busy = false;
      queued.length = 0;
      if (pen) pen.placeholder = t("pen_placeholder");
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
      ink(t("no_editor"), "rd-diary");
      // busy／佇列的重置一律交給呼叫端 startTurn 同步處理，避免「非同步 callback 設 busy」
      // 與「同步設 busy」互相競態（例如失敗 callback 晚一步把新一輪的 busy 清掉）。
      return false;
    }
    ed.focus();
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
      // execCommand 失敗時不派發合成 beforeinput：ProseMirror 類編輯器靠 DOM 變動觀察器
      // 取得輸入，合成事件不會觸發瀏覽器的預設插入，文字其實寫不進去，只會拖到
      // watchResponse 逾時才解鎖。直接提示並回傳 false，由呼叫端立即重置 busy／佇列。
      ink(t("insert_fail"), "rd-diary");
      return false;
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
        // 只有在「非串流」時才判逾時：思考型模型的思考區塊被雜訊過濾後 cur 可能為空，
        // 但 stopBtn 仍在＝還在生成，不能誤判為無回應。
        if (ticks > 220 && !streaming) return finish(timer, waiting, null);
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
      // 安全網逾時同樣只在非串流時觸發，否則長文本生成會被中途截斷。
      if (ticks > 400 && !streaming) return finish(timer, waiting, lastText);
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
      if (pen) {
        pen.placeholder = t("pen_placeholder");
        // sendToClaude 期間焦點被移到底層編輯器；回完後搶回日記輸入框，
        // 否則使用者後續輸入會打進隱藏的底層編輯器，且 Enter 可能誤送。
        pen.focus();
      }
    };
    ink(text || t("no_echo"), "rd-diary", after);
  }
})();
