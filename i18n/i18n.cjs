// i18n/i18n.js — 執行期語言解析 + 字串查詢助手
// 使用 UMD 包裝：瀏覽器由 manifest 依序載入（掛到 globalThis.RiddleDiary.i18n），
// Node.js 以 require() 載入（module.exports）。不使用裸 ES export。
// 依賴：必須在 i18n/messages.js 之後載入，否則 messages 尚未掛上。
(function (root) {
  "use strict";

  // ── resolveLocale ────────────────────────────────────────────────────────
  // 純函式：給定偏好設定值（"auto" | "zh_TW" | "en" | falsy）與瀏覽器 UI 語言字串，
  // 回傳應使用的 locale 代碼（"zh_TW" | "en"）。
  // 設計原則：顯式偏好勝出；"auto" 才看 uiLang；uiLang 以 "zh" 開頭 → zh_TW，其餘 → en。
  function resolveLocale(pref, uiLang) {
    if (pref === "zh_TW") return "zh_TW";
    if (pref === "en")    return "en";
    // auto 或任何其他值：fall through 到 uiLang 推斷
    const lang = (typeof uiLang === "string" ? uiLang : "").toLowerCase();
    return lang.startsWith("zh") ? "zh_TW" : "en";
  }

  // ── getMessage ───────────────────────────────────────────────────────────
  // 同步查詢字串。locale 未傳入時使用目前已解析的 locale（見 _currentLocale）。
  // 找不到 key → 回傳 key 本身（讓 UI 至少顯示有意義的 fallback，不要空白）。
  const _warnedLocales = new Set(); // 防止 applyI18n() 對每個 data-i18n 元素各噴一次警告
  function getMessage(key, locale) {
    const loc = locale || _currentLocale;
    const messages = (api.i18n && api.i18n.messages) || {};
    const dict = messages[loc] || messages.zh_TW || {};
    // 只在「messages module 已載入 + 指定 locale dict 缺失」時警告，避免 messages.cjs
    // 尚未載入（load order 錯誤）時對所有 locale 誤報 — 該情況下 messages.zh_TW 也不存在。
    if (
      loc !== "zh_TW" &&
      !messages[loc] &&
      messages.zh_TW &&
      !_warnedLocales.has(loc) &&
      typeof console !== "undefined"
    ) {
      _warnedLocales.add(loc);
      console.warn("[Ink Diary] i18n: locale dict missing, fallback to zh_TW:", loc);
    }
    return Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key;
  }

  // ── 內部狀態 ─────────────────────────────────────────────────────────────
  // _currentLocale 在 initLocale() 之後確定；預設 "zh_TW" 保持最安全的 fallback。
  let _currentLocale = "zh_TW";

  // ── initLocale ───────────────────────────────────────────────────────────
  // 從 chrome.storage.sync 讀取語言偏好，解析後更新 _currentLocale，
  // 並呼叫回呼（讓呼叫端在確定語言後才渲染 UI）。
  // 在 Node / 測試環境中 chrome 不存在，此函式為無操作（只呼叫 cb）。
  function initLocale(cb) {
    if (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.sync
    ) {
      try {
        chrome.storage.sync.get({ language: "auto" }, function (cfg) {
          var uiLang = "";
          try {
            uiLang =
              typeof chrome.i18n !== "undefined" &&
              typeof chrome.i18n.getUILanguage === "function"
                ? chrome.i18n.getUILanguage()
                : navigator.language || "";
          } catch (e) {
            uiLang = (navigator && navigator.language) || "";
          }
          _currentLocale = resolveLocale(cfg.language, uiLang);
          if (typeof cb === "function") cb(_currentLocale);
        });
      } catch (e) {
        if (typeof cb === "function") cb(_currentLocale);
      }
    } else {
      if (typeof cb === "function") cb(_currentLocale);
    }
  }

  // ── setLocale ────────────────────────────────────────────────────────────
  // 直接設定目前 locale（供 popup.js / storage.onChanged 使用）。
  function setLocale(locale) {
    if (locale === "zh_TW" || locale === "en") {
      _currentLocale = locale;
    }
  }

  // ── getLocale ────────────────────────────────────────────────────────────
  function getLocale() {
    return _currentLocale;
  }

  // ── 全域掛載 ─────────────────────────────────────────────────────────────
  const api = (root.RiddleDiary = root.RiddleDiary || {});
  // messages 由 messages.js 掛到 api.i18n.messages；此處合併剩餘 helper。
  api.i18n = api.i18n || {};
  api.i18n.resolveLocale = resolveLocale;
  api.i18n.getMessage    = getMessage;
  api.i18n.initLocale    = initLocale;
  api.i18n.setLocale     = setLocale;
  api.i18n.getLocale     = getLocale;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      resolveLocale: resolveLocale,
      getMessage:    getMessage,
      initLocale:    initLocale,
      setLocale:     setLocale,
      getLocale:     getLocale,
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
