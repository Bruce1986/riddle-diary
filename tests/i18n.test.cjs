// tests/i18n.test.cjs — i18n 模組單元測試
// 覆蓋：resolveLocale 邏輯、dictionary key 一致性
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// 依 manifest 載入順序：messages.cjs 先，i18n.cjs 後
require(path.resolve(__dirname, "../i18n/messages.cjs"));
const { resolveLocale, getMessage, setLocale, getLocale, initLocale } = require(path.resolve(__dirname, "../i18n/i18n.cjs"));

// messages dict（直接從 globalThis 取，避免重複 require 產生快取問題）
const messages = globalThis.RiddleDiary.i18n.messages;

// ─── 1. resolveLocale ─────────────────────────────────────────────────────

describe("resolveLocale", () => {
  it('resolveLocale("auto", "zh-TW") → "zh_TW"', () => {
    assert.strictEqual(resolveLocale("auto", "zh-TW"), "zh_TW");
  });

  it('resolveLocale("auto", "zh-HK") → "zh_TW"（zh 前綴）', () => {
    assert.strictEqual(resolveLocale("auto", "zh-HK"), "zh_TW");
  });

  it('resolveLocale("auto", "en-US") → "en"', () => {
    assert.strictEqual(resolveLocale("auto", "en-US"), "en");
  });

  it('resolveLocale("auto", "ja") → "en"（非 zh 語系預設 en）', () => {
    assert.strictEqual(resolveLocale("auto", "ja"), "en");
  });

  it('resolveLocale("en", "zh-TW") → "en"（顯式偏好勝出）', () => {
    assert.strictEqual(resolveLocale("en", "zh-TW"), "en");
  });

  it('resolveLocale("zh_TW", "en-US") → "zh_TW"（顯式偏好勝出）', () => {
    assert.strictEqual(resolveLocale("zh_TW", "en-US"), "zh_TW");
  });

  it('resolveLocale(undefined, "zh-TW") → "zh_TW"（falsy pref 視為 auto）', () => {
    assert.strictEqual(resolveLocale(undefined, "zh-TW"), "zh_TW");
  });

  it('resolveLocale(null, "en") → "en"（falsy pref 視為 auto）', () => {
    assert.strictEqual(resolveLocale(null, "en"), "en");
  });

  it('resolveLocale("auto", "") → "en"（空字串 uiLang 預設 en）', () => {
    assert.strictEqual(resolveLocale("auto", ""), "en");
  });

  it("resolveLocale 未知 pref 走 auto fallback (unknown → uiLang)", () => {
    assert.strictEqual(resolveLocale("fr", "zh-TW"), "zh_TW");
    assert.strictEqual(resolveLocale("de-DE", "en-US"), "en");
  });
});

// ─── 2. dictionary key 一致性 ─────────────────────────────────────────────

describe("messages dictionary key parity", () => {
  it("messages.zh_TW 與 messages.en 存在且為物件", () => {
    assert.ok(messages && typeof messages === "object", "messages 應為物件");
    assert.ok(messages.zh_TW && typeof messages.zh_TW === "object", "messages.zh_TW 應為物件");
    assert.ok(messages.en && typeof messages.en === "object", "messages.en 應為物件");
  });

  it("zh_TW 的所有 key 也存在於 en（不允許缺漏）", () => {
    const zhKeys = Object.keys(messages.zh_TW);
    const enKeys = new Set(Object.keys(messages.en));
    const missingInEn = zhKeys.filter((k) => !enKeys.has(k));
    assert.strictEqual(
      missingInEn.length,
      0,
      "以下 key 在 zh_TW 存在、在 en 缺漏：\n  " + missingInEn.join("\n  ")
    );
  });

  it("en 的所有 key 也存在於 zh_TW（不允許缺漏）", () => {
    const enKeys = Object.keys(messages.en);
    const zhKeys = new Set(Object.keys(messages.zh_TW));
    const missingInZh = enKeys.filter((k) => !zhKeys.has(k));
    assert.strictEqual(
      missingInZh.length,
      0,
      "以下 key 在 en 存在、在 zh_TW 缺漏：\n  " + missingInZh.join("\n  ")
    );
  });

  it("zh_TW 與 en 的 key 數量相同", () => {
    const zhCount = Object.keys(messages.zh_TW).length;
    const enCount = Object.keys(messages.en).length;
    assert.strictEqual(
      zhCount,
      enCount,
      `key 數量不一致：zh_TW 有 ${zhCount} 個，en 有 ${enCount} 個`
    );
  });

  it("所有 key 的值均為非空字串", () => {
    for (const locale of ["zh_TW", "en"]) {
      for (const [key, val] of Object.entries(messages[locale])) {
        assert.strictEqual(
          typeof val,
          "string",
          `messages.${locale}.${key} 應為字串，實為 ${typeof val}`
        );
        assert.ok(
          val.length > 0,
          `messages.${locale}.${key} 不應為空字串`
        );
      }
    }
  });
});

// ─── 3. getMessage ────────────────────────────────────────────────────────

describe("getMessage", () => {
  it("存在的 key → 回傳對應字串（zh_TW）", () => {
    const val = getMessage("close_button", "zh_TW");
    assert.strictEqual(val, messages.zh_TW.close_button);
  });

  it("存在的 key → 回傳對應字串（en）", () => {
    const val = getMessage("close_button", "en");
    assert.strictEqual(val, messages.en.close_button);
  });

  it("不存在的 key → 回傳 key 本身（graceful fallback）", () => {
    const val = getMessage("nonexistent_key_xyz", "en");
    assert.strictEqual(val, "nonexistent_key_xyz");
  });

  it("getMessage(key) 不帶 locale 時走內部 _currentLocale（node 環境預設 zh_TW）", () => {
    const val = getMessage("close_button");
    assert.strictEqual(val, messages.zh_TW.close_button, "zero-arg getMessage 應回傳與 messages.zh_TW.close_button 完全相同的字串");
  });

  it("getMessage 未知 locale 走 zh_TW fallback（不回 raw key）", () => {
    assert.strictEqual(getMessage("close_button", "de"), messages.zh_TW.close_button);
  });

  it("getMessage 未知 locale + 不存在 key → 回 raw key（double-miss 契約）", () => {
    // 保證即使 zh_TW dict fallback 也找不到 key 時，仍回 key 本身（不會拋錯或回 undefined）。
    assert.strictEqual(getMessage("nonexistent_key_xyz", "de"), "nonexistent_key_xyz");
  });
});

// ─── 4. setLocale / getLocale / initLocale ──────────────────────────────────

describe("setLocale / getLocale (內部狀態)", () => {
  it("setLocale 接受 'en'，getLocale 反映之", () => {
    const original = getLocale();
    setLocale("en");
    assert.strictEqual(getLocale(), "en");
    setLocale(original); // 還原，避免污染其他測試
  });

  it("setLocale 拒絕未知值，getLocale 不變", () => {
    const original = getLocale();
    setLocale("fr"); // 非白名單
    assert.strictEqual(getLocale(), original);
  });

  it("setLocale 接受 'zh_TW'，getLocale 反映之", () => {
    setLocale("zh_TW");
    assert.strictEqual(getLocale(), "zh_TW");
  });
});

describe("getMessage 未知 locale 警告 (dedup 契約)", () => {
  it("未知 locale 只警告一次（applyI18n 一次觸發 N 個 data-i18n 元素不會噴 N 條）", () => {
    // 攔截 console.warn 計數；使用一個尚未被其他測試消費過的 locale 名字
    // （若不同回 test 順序影響 _warnedLocales，此測試會失敗），故用 locale 前綴 dedup-test。
    const orig = console.warn;
    let warnCount = 0;
    console.warn = () => { warnCount++; };
    try {
      getMessage("close_button", "dedup-test-xx");
      getMessage("close_button", "dedup-test-xx");
      getMessage("close_button", "dedup-test-xx");
    } finally {
      console.warn = orig;
    }
    assert.strictEqual(warnCount, 1, "重複呼叫同一未知 locale 應僅警告一次（dedup 生效）");
  });
});

describe("initLocale (Node 環境：chrome 不存在時走 fallback)", () => {
  it("initLocale(cb) 在 Node 環境同步以 zh_TW 呼叫 cb", () => {
    setLocale("zh_TW"); // 重置為預設，避免 setLocale 測試污染
    let called = false;
    let received = null;
    initLocale(function (locale) {
      called = true;
      received = locale;
    });
    assert.strictEqual(called, true, "initLocale 應同步觸發 callback");
    assert.strictEqual(received, "zh_TW", "Node 環境下無 chrome.storage，回 zh_TW");
  });
});
