// tests/manifest-load.test.cjs — 驗證 manifest 的瀏覽器載入順序（registry.cjs → claude.cjs）
// node --test 預設每個測試檔在獨立 process 執行，因此這裡是全新乾淨的 Node 環境：
// 不需備份/還原 globalThis，也不需操作 require.cache，天然隔離。
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const registryPath = path.resolve(__dirname, "../platforms/registry.cjs");
const claudePath = path.resolve(__dirname, "../platforms/claude.cjs");

describe("manifest 載入順序（browser-like: registry.cjs → claude.cjs）", () => {
  it("依 manifest 順序載入後 globalThis.RiddleDiary.platforms.claude 存在", () => {
    // 全新 process：載入任何平台檔前，全域尚無 RiddleDiary（確保測試有意義、非恆真）
    assert.strictEqual(
      globalThis.RiddleDiary,
      undefined,
      "process 起始時不應已有 globalThis.RiddleDiary"
    );

    // Step 1：先載 registry.cjs（此時 platforms 尚未有 claude）
    require(registryPath);
    const afterRegistry = globalThis.RiddleDiary;
    assert.ok(afterRegistry, "registry 載入後 RiddleDiary 應存在");
    assert.strictEqual(
      afterRegistry.platforms && afterRegistry.platforms.claude,
      undefined,
      "registry 載入後 platforms.claude 不應存在（claude.cjs 尚未載入）"
    );

    // Step 2：再載 claude.cjs（此時 platforms.claude 才掛上）
    require(claudePath);
    assert.ok(
      globalThis.RiddleDiary.platforms && globalThis.RiddleDiary.platforms.claude,
      "claude.cjs 載入後 platforms.claude 應存在"
    );
  });

  it("依 manifest 順序載入後 selectPlatform('claude.ai') 回傳 id === 'claude'", () => {
    const api = globalThis.RiddleDiary;
    assert.strictEqual(typeof api.selectPlatform, "function", "selectPlatform 應為函式");
    const result = api.selectPlatform("claude.ai");
    assert.ok(result !== null, "selectPlatform('claude.ai') 不應回傳 null");
    assert.strictEqual(result.id, "claude", "回傳物件的 id 應為 'claude'");
  });
});
