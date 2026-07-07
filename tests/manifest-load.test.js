// tests/manifest-load.test.js — 驗證 manifest 的瀏覽器載入順序
// （registry.js → claude.js → chatgpt.js → gemini.js）
// node --test 預設每個測試檔在獨立 process 執行，因此這裡是全新乾淨的 Node 環境：
// 不需備份/還原 globalThis，也不需操作 require.cache，天然隔離。
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const registryPath = path.resolve(__dirname, "../platforms/registry.js");
const claudePath = path.resolve(__dirname, "../platforms/claude.js");
const chatgptPath = path.resolve(__dirname, "../platforms/chatgpt.js");
const geminiPath = path.resolve(__dirname, "../platforms/gemini.js");

describe("manifest 載入順序（browser-like: registry.js → claude.js → chatgpt.js → gemini.js）", () => {
  it("依 manifest 順序載入後 globalThis.RiddleDiary.platforms.claude 存在", () => {
    // 全新 process：載入任何平台檔前，全域尚無 RiddleDiary（確保測試有意義、非恆真）
    assert.strictEqual(
      globalThis.RiddleDiary,
      undefined,
      "process 起始時不應已有 globalThis.RiddleDiary"
    );

    // Step 1：先載 registry.js（此時 platforms 尚未有任何平台）
    require(registryPath);
    const afterRegistry = globalThis.RiddleDiary;
    assert.ok(afterRegistry, "registry 載入後 RiddleDiary 應存在");
    assert.strictEqual(
      afterRegistry.platforms && afterRegistry.platforms.claude,
      undefined,
      "registry 載入後 platforms.claude 不應存在（claude.js 尚未載入）"
    );

    // Step 2：再載 claude.js（此時 platforms.claude 才掛上）
    require(claudePath);
    assert.ok(
      globalThis.RiddleDiary.platforms && globalThis.RiddleDiary.platforms.claude,
      "claude.js 載入後 platforms.claude 應存在"
    );

    // Step 3：再載 chatgpt.js
    require(chatgptPath);
    assert.ok(
      globalThis.RiddleDiary.platforms && globalThis.RiddleDiary.platforms.chatgpt,
      "chatgpt.js 載入後 platforms.chatgpt 應存在"
    );

    // Step 4：再載 gemini.js
    require(geminiPath);
    assert.ok(
      globalThis.RiddleDiary.platforms && globalThis.RiddleDiary.platforms.gemini,
      "gemini.js 載入後 platforms.gemini 應存在"
    );
  });

  it("三平台皆就位後 platforms 物件包含 claude、chatgpt、gemini 三個鍵", () => {
    const platforms = globalThis.RiddleDiary.platforms;
    assert.ok(platforms.claude, "platforms.claude 應存在");
    assert.ok(platforms.chatgpt, "platforms.chatgpt 應存在");
    assert.ok(platforms.gemini, "platforms.gemini 應存在");
  });

  it("依 manifest 順序載入後 selectPlatform('claude.ai') 回傳 id === 'claude'", () => {
    const api = globalThis.RiddleDiary;
    assert.strictEqual(typeof api.selectPlatform, "function", "selectPlatform 應為函式");
    const result = api.selectPlatform("claude.ai");
    assert.ok(result !== null, "selectPlatform('claude.ai') 不應回傳 null");
    assert.strictEqual(result.id, "claude", "回傳物件的 id 應為 'claude'");
  });

  it("selectPlatform('chatgpt.com') 回傳 id === 'chatgpt'", () => {
    const api = globalThis.RiddleDiary;
    const result = api.selectPlatform("chatgpt.com");
    assert.ok(result !== null, "selectPlatform('chatgpt.com') 不應回傳 null");
    assert.strictEqual(result.id, "chatgpt");
  });

  it("selectPlatform('chat.openai.com') 回傳 id === 'chatgpt'", () => {
    const api = globalThis.RiddleDiary;
    const result = api.selectPlatform("chat.openai.com");
    assert.ok(result !== null, "selectPlatform('chat.openai.com') 不應回傳 null");
    assert.strictEqual(result.id, "chatgpt");
  });

  it("selectPlatform('gemini.google.com') 回傳 id === 'gemini'", () => {
    const api = globalThis.RiddleDiary;
    const result = api.selectPlatform("gemini.google.com");
    assert.ok(result !== null, "selectPlatform('gemini.google.com') 不應回傳 null");
    assert.strictEqual(result.id, "gemini");
  });
});
