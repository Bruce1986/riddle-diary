// popup.js — 管理擴充設定彈出視窗
// 依賴：i18n/messages.js + i18n/i18n.js 已在 popup.html 中先行載入

(function () {
  "use strict";

  const _i18n = (typeof globalThis !== "undefined" && globalThis.RiddleDiary && globalThis.RiddleDiary.i18n) || null;

  // ── i18n 套用 ────────────────────────────────────────────────────
  // 遍歷所有帶 data-i18n 的元素，寫入目前語言的字串。
  function applyI18n() {
    if (!_i18n) { console.warn("[Ink Diary] popup: RiddleDiary.i18n not loaded"); return; }
    if (typeof _i18n.getMessage !== "function") return;
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      el.textContent = _i18n.getMessage(key);
    });
  }

  // ── 初始化 locale 並渲染 ─────────────────────────────────────────
  function init() {
    if (_i18n && typeof _i18n.initLocale === "function") {
      _i18n.initLocale(function () {
        applyI18n();
        loadSettings();
      });
    } else {
      loadSettings();
    }
  }

  // ── 讀取並套用設定 ───────────────────────────────────────────────
  function loadSettings() {
    chrome.storage.sync.get(
      { rd_enabled: true, rd_persona: true, language: "auto" },
      function (cfg) {
        document.getElementById("enabled").checked = cfg.rd_enabled;
        document.getElementById("persona").checked = cfg.rd_persona;

        // 勾選對應的語言 radio
        var radios = document.querySelectorAll('input[name="language"]');
        radios.forEach(function (r) {
          r.checked = r.value === cfg.language;
        });
      }
    );
  }

  // ── 事件綁定 ─────────────────────────────────────────────────────
  document.getElementById("enabled").addEventListener("change", function () {
    chrome.storage.sync.set({ rd_enabled: this.checked }, function () {
      if (chrome.runtime.lastError) console.warn("[Ink Diary] failed to save rd_enabled:", chrome.runtime.lastError.message);
    });
  });

  document.getElementById("persona").addEventListener("change", function () {
    chrome.storage.sync.set({ rd_persona: this.checked }, function () {
      if (chrome.runtime.lastError) console.warn("[Ink Diary] failed to save rd_persona:", chrome.runtime.lastError.message);
    });
  });

  // 語言 radio：寫入 storage；同時即時更新 popup 自身的 UI 語言。
  document.querySelectorAll('input[name="language"]').forEach(function (radio) {
    radio.addEventListener("change", function () {
      var value = this.value;
      chrome.storage.sync.set({ language: value }, function () {
        if (chrome.runtime.lastError) {
          console.warn("[Ink Diary] failed to save language pref:", chrome.runtime.lastError.message);
        }
      });

      // 即時切換 popup 語言（不等 content script 的 storage 事件）
      if (_i18n && typeof _i18n.resolveLocale === "function" && typeof _i18n.setLocale === "function") {
        var uiLang = "";
        try {
          uiLang =
            typeof chrome.i18n !== "undefined" && typeof chrome.i18n.getUILanguage === "function"
              ? chrome.i18n.getUILanguage()
              : navigator.language || "";
        } catch (e) {
          uiLang = (navigator && navigator.language) || "";
        }
        _i18n.setLocale(_i18n.resolveLocale(value, uiLang));
        applyI18n();
      }
    });
  });

  // ── 外部語言變更同步（例如另一個分頁的 content script 切換了語言）────
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "sync") return;
    if (changes.language && _i18n) {
      if (!("newValue" in changes.language)) return; // 守衛：storage key 刪除時不處理
      const uiLang = (typeof chrome !== "undefined" && chrome.i18n && typeof chrome.i18n.getUILanguage === "function")
        ? chrome.i18n.getUILanguage()
        : (navigator.language || "");
      _i18n.setLocale(_i18n.resolveLocale(changes.language.newValue, uiLang));
      applyI18n();
    }
  });

  // ── 啟動 ─────────────────────────────────────────────────────────
  init();
})();
