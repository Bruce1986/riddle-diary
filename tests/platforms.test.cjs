// tests/platforms.test.cjs — node:test 單元測試（CommonJS，搭配 UMD 的 require 載入）
"use strict";

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

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

// ─── 5. manifest 載入順序（browser-like）────────────────────────────────
// manifest 實際順序：registry.cjs → claude.cjs → content.js
// 此測試在乾淨的 require.cache 下依此順序重新載入，
// 驗證 globalThis.RiddleDiary.selectPlatform("claude.ai") 能正確解析。
// 若先載 claude.cjs 再載 registry.cjs（錯誤順序），registry 對 platforms 的讀取
// 並不依賴順序（registry 是 lazy 讀取），但此測試確認 manifest 正確順序下
// 全域 API 的完整性：platforms.claude 存在、selectPlatform 存在、且回傳正確物件。

describe("manifest 載入順序（browser-like: registry.cjs → claude.cjs）", () => {
  const registryPath = path.resolve(__dirname, "../platforms/registry.cjs");
  const claudePath = path.resolve(__dirname, "../platforms/claude.cjs");

  let savedRiddleDiary;

  before(() => {
    // 備份目前 globalThis.RiddleDiary，測試後還原
    savedRiddleDiary = globalThis.RiddleDiary;
    // 清掉全域，確保這是乾淨的 browser-like 環境
    globalThis.RiddleDiary = undefined;
    // 清掉 require.cache 讓 UMD 重新執行並重新掛到 globalThis
    delete require.cache[registryPath];
    delete require.cache[claudePath];
  });

  it("依 manifest 順序載入後 globalThis.RiddleDiary.platforms.claude 存在", () => {
    // Step 1：先載 registry.cjs（此時 platforms 尚未有 claude）
    require(registryPath);
    // 驗證此時 platforms.claude 還不存在（確保測試有意義、不是恆真）
    const afterRegistry = globalThis.RiddleDiary;
    assert.ok(afterRegistry, "registry 載入後 RiddleDiary 應存在");
    assert.strictEqual(
      afterRegistry.platforms && afterRegistry.platforms.claude,
      undefined,
      "registry 載入後 platforms.claude 不應存在（claude.cjs 尚未載入）"
    );

    // Step 2：再載 claude.cjs（此時 platforms.claude 才掛上）
    require(claudePath);
    const afterClaude = globalThis.RiddleDiary;
    assert.ok(
      afterClaude.platforms && afterClaude.platforms.claude,
      "claude.cjs 載入後 platforms.claude 應存在"
    );
  });

  it("依 manifest 順序載入後 selectPlatform('claude.ai') 回傳 id === 'claude'", () => {
    // registry 與 claude 已在 before/前一個 it 中依序載入
    const api = globalThis.RiddleDiary;
    assert.ok(api, "globalThis.RiddleDiary 應存在");
    assert.strictEqual(typeof api.selectPlatform, "function", "selectPlatform 應為函式");
    const result = api.selectPlatform("claude.ai");
    assert.ok(result !== null, "selectPlatform('claude.ai') 不應回傳 null");
    assert.strictEqual(result.id, "claude", "回傳物件的 id 應為 'claude'");
  });

  // 收尾：還原 globalThis.RiddleDiary 並清掉 cache，避免污染其他測試
  // node:test 目前沒有 after()，利用最後一個 it 收尾
  it("還原 globalThis.RiddleDiary（清理沙箱）", () => {
    delete require.cache[registryPath];
    delete require.cache[claudePath];
    globalThis.RiddleDiary = savedRiddleDiary;
    // 重新 require 讓後續其他 describe 用的參照仍然有效
    require(registryPath);
    require(claudePath);
    assert.ok(true, "沙箱清理完成");
  });
});
