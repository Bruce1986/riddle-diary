// i18n/messages.js — 雙語字典（繁體中文 + English）
// 使用 UMD 包裝：瀏覽器由 manifest 依序載入（掛到 globalThis.RiddleDiary.i18n.messages），
// Node.js 以 require() 載入（module.exports）。不使用裸 ES export。
// 注意：所有使用者可見字串皆在此集中管理；zh_TW 與 en 的 key 集合必須完全一致。
(function (root) {
  "use strict";

  const messages = {
    zh_TW: {
      // ── 書封 / 覆蓋層 ──────────────────────────────────────────────
      cover_title:        "墨水日記",
      cover_sub:          "A Diary",
      cover_hint:         "輕觸以翻開",

      // ── 按鈕 ───────────────────────────────────────────────────────
      peek_button:        "窺視",
      close_button:       "闔上",
      open_new_page:      "✚ 翻開新的一頁",
      reopen_hint:        "翻回日記",

      // ── 書籤 / 歷史面板 ────────────────────────────────────────────
      bookmark_aria:      "翻開左側的歷史篇章",
      bookmark_label:     "書籤",
      history_head:       "過往的篇章",
      history_close:      "收起 ›",
      history_empty:      "翻不到更早的篇章——也許側邊欄尚未展開／載入，或這是一段全新的記憶。",

      // ── 輸入框提示 ─────────────────────────────────────────────────
      pen_placeholder:    "在此落筆…（Enter 送出，Shift+Enter 換行）",
      pen_placeholder_busy: "日記正在回覆中…（可繼續落筆，會依序送出）",

      // ── 內文 / 狀態訊息 ────────────────────────────────────────────
      caption:            "羽毛筆 · 墨水會自行滲入紙頁，再由日記回應你",
      intro_line:         "翻開了一本沒有主人的舊日記，扉頁上緩緩浮現一行字……",
      ink_waiting:        "墨水正在紙頁上凝聚……",
      no_echo:            "（這次紙頁沒有回音……再試一次？）",
      no_editor:          "（紙頁無法與底下的墨池相連…請確認頁面已開啟一個對話）",
      insert_fail:        "（紙頁無法把墨水寫入底下的輸入框…請重新整理頁面或手動輸入）",
      load_fail:          "（記憶似乎有些模糊，無法載入此篇章…請嘗試重新整理頁面）",

      // ── Popup ──────────────────────────────────────────────────────
      popup_h1:           "墨水日記 · Ink Diary",
      popup_sub:          "在 Claude / ChatGPT / Gemini 上開啟。",
      popup_disguise_label:  "開啟日記偽裝",
      popup_persona_label:   "啟用魔法日記人設",
      popup_hint:         "提示：日記畫面中長按右上「窺視」可暫時看一眼底下的 AI 介面。",
      popup_language_label:  "語言 / Language",
      popup_lang_auto:    "自動",
      popup_lang_zh_tw:   "繁體中文",
      popup_lang_en:      "English",
    },

    en: {
      // ── Book cover / overlay ───────────────────────────────────────
      cover_title:        "Ink Diary",
      cover_sub:          "A Diary",
      cover_hint:         "Tap to open",

      // ── Buttons ────────────────────────────────────────────────────
      peek_button:        "Peek",
      close_button:       "Close",
      open_new_page:      "✚ Turn to a New Page",
      reopen_hint:        "Open the diary",

      // ── Bookmark / history panel ───────────────────────────────────
      bookmark_aria:      "Open the history chapters on the left",
      bookmark_label:     "Bookmark",
      history_head:       "Past Chapters",
      history_close:      "Collapse ›",
      history_empty:      "No earlier chapters found — the sidebar may not be expanded yet, or this is a brand new memory.",

      // ── Textarea placeholder ───────────────────────────────────────
      pen_placeholder:    "Write here… (Enter to send, Shift+Enter for new line)",
      pen_placeholder_busy: "The diary is replying… (you may keep writing; messages are queued)",

      // ── Body / status messages ─────────────────────────────────────
      caption:            "Quill pen · Ink seeps into the parchment on its own, and the diary answers you in kind",
      intro_line:         "An ownerless old diary opens before you; words slowly surface on the frontispiece…",
      ink_waiting:        "Ink is gathering on the parchment…",
      no_echo:            "(The page returned no echo this time… try again?)",
      no_editor:          "(The page cannot reach the ink pool below… please ensure a conversation is open)",
      insert_fail:        "(The page cannot write your ink into the box beneath… refresh the page or type directly)",
      load_fail:          "(The memories seem blurred — this chapter could not be loaded… try refreshing the page)",

      // ── Popup ──────────────────────────────────────────────────────
      popup_h1:           "墨水日記 · Ink Diary",
      popup_sub:          "Active on Claude, ChatGPT, and Gemini.",
      popup_disguise_label:  "Enable diary disguise",
      popup_persona_label:   "Enable magical diary persona",
      popup_hint:         'Tip: Hold the “Peek” button (top-right) to briefly glimpse the AI interface beneath.',
      popup_language_label:  "語言 / Language",
      popup_lang_auto:    "Auto",
      popup_lang_zh_tw:   "繁體中文",
      popup_lang_en:      "English",
    },
  };

  // 掛到全域命名空間（供 content.js / popup.js 使用）
  const api = (root.RiddleDiary = root.RiddleDiary || {});
  api.i18n = api.i18n || {};
  api.i18n.messages = messages;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = messages;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
