// tests/platforms.test.cjs — node:test 單元測試（CommonJS，搭配 UMD 的 require 載入）
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

// 先 require claude.cjs：UMD 會同時掛到 globalThis.RiddleDiary.platforms.claude
const claudePlatform = require("../platforms/claude.cjs");
// 再 require registry.cjs：此時 globalThis.RiddleDiary.platforms.claude 已存在
const { selectPlatform } = require("../platforms/registry.cjs");

// ─── 1. platforms/claude.js schema 完整性 ─────────────────────────────────

describe("platforms/claude.js schema", () => {
  it("module.exports 回傳物件", () => {
    assert.strictEqual(typeof claudePlatform, "object");
    assert.ok(claudePlatform !== null);
  });

  it("id 是字串 'claude'", () => {
    assert.strictEqual(typeof claudePlatform.id, "string");
    assert.strictEqual(claudePlatform.id, "claude");
  });

  it("siteName 是字串", () => {
    assert.strictEqual(typeof claudePlatform.siteName, "string");
    assert.ok(claudePlatform.siteName.length > 0);
  });

  it("persona 是非空字串", () => {
    assert.strictEqual(typeof claudePlatform.persona, "string");
    assert.ok(claudePlatform.persona.length > 0);
  });

  it("selectors 存在且各鍵正確", () => {
    const s = claudePlatform.selectors;
    assert.strictEqual(typeof s, "object");
    assert.ok(s !== null);
    const requiredKeys = [
      "editor",
      "sendBtn",
      "stopBtn",
      "response",
      "userMsg",
      "noise",
      "historyItem",
      "historyItemFallback",
    ];
    for (const key of requiredKeys) {
      assert.strictEqual(
        typeof s[key],
        "string",
        `selectors.${key} 應為字串`
      );
      assert.ok(s[key].length > 0, `selectors.${key} 不應為空字串`);
    }
  });

  it("isOverlayPath 是函式", () => {
    assert.strictEqual(typeof claudePlatform.isOverlayPath, "function");
  });

  it("isExistingConversationPath 是函式", () => {
    assert.strictEqual(
      typeof claudePlatform.isExistingConversationPath,
      "function"
    );
  });

  it("writeStrategy 是字串", () => {
    assert.strictEqual(typeof claudePlatform.writeStrategy, "string");
  });

  it("features 是物件且 history 為布林", () => {
    assert.strictEqual(typeof claudePlatform.features, "object");
    assert.ok(claudePlatform.features !== null);
    assert.strictEqual(typeof claudePlatform.features.history, "boolean");
  });
});

// ─── 2. registry.selectPlatform ──────────────────────────────────────────

describe("registry.selectPlatform", () => {
  it("'claude.ai' → 回傳 claude 設定物件", () => {
    const result = selectPlatform("claude.ai");
    assert.ok(result !== null, "不應回傳 null");
    assert.strictEqual(result.id, "claude");
  });

  it("子網域 'www.claude.ai' → 回傳 claude 設定物件", () => {
    const result = selectPlatform("www.claude.ai");
    assert.ok(result !== null);
    assert.strictEqual(result.id, "claude");
  });

  it("'chatgpt.com' → 回傳 null", () => {
    assert.strictEqual(selectPlatform("chatgpt.com"), null);
  });

  it("'example.com' → 回傳 null", () => {
    assert.strictEqual(selectPlatform("example.com"), null);
  });

  it("空字串 '' → 回傳 null", () => {
    assert.strictEqual(selectPlatform(""), null);
  });
});

// ─── 3. isOverlayPath 邏輯 ───────────────────────────────────────────────

describe("isOverlayPath", () => {
  const { isOverlayPath } = claudePlatform;

  // 應為 true（顯示覆蓋層）的路徑
  it("'/' → true", () => {
    assert.strictEqual(isOverlayPath("/"), true);
  });

  it("'/chat/abc' → true", () => {
    assert.strictEqual(isOverlayPath("/chat/abc"), true);
  });

  it("'/project/x' → true", () => {
    assert.strictEqual(isOverlayPath("/project/x"), true);
  });

  it("'/new' → true", () => {
    assert.strictEqual(isOverlayPath("/new"), true);
  });

  it("'/recents' → true", () => {
    assert.strictEqual(isOverlayPath("/recents"), true);
  });

  // 應為 false（不顯示覆蓋層）的路徑
  it("'/login' → false", () => {
    assert.strictEqual(isOverlayPath("/login"), false);
  });

  it("'/settings' → false", () => {
    assert.strictEqual(isOverlayPath("/settings"), false);
  });

  it("'/about' → false", () => {
    assert.strictEqual(isOverlayPath("/about"), false);
  });
});

// ─── 4. isExistingConversationPath 邏輯 ──────────────────────────────────

describe("isExistingConversationPath", () => {
  const { isExistingConversationPath } = claudePlatform;

  it("'/chat/abc' → true", () => {
    assert.strictEqual(isExistingConversationPath("/chat/abc"), true);
  });

  it("'/chat/123-456' → true", () => {
    assert.strictEqual(isExistingConversationPath("/chat/123-456"), true);
  });

  it("'/' → false", () => {
    assert.strictEqual(isExistingConversationPath("/"), false);
  });

  it("'/new' → false", () => {
    assert.strictEqual(isExistingConversationPath("/new"), false);
  });

  it("'/project/x' → false", () => {
    assert.strictEqual(isExistingConversationPath("/project/x"), false);
  });
});
