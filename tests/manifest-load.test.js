// tests/manifest-load.test.js — 驗證 manifest.json 宣告的 content script 載入順序真的可用
// node --test 預設每個測試檔在獨立 process 執行，因此這裡是全新乾淨的 Node 環境：
// 不需備份/還原 globalThis，也不需操作 require.cache，天然隔離。
//
// 測試讀「真正的 manifest.json」而非硬編載入順序：守的是 load-bearing 不變量——
// (1) content.js 必須最後載入（它啟動時就消費 globalThis.RiddleDiary 與 i18n 全域）；
// (2) platforms/ 下每個平台檔都要列進 manifest（漏列 = 該平台在瀏覽器端無聲失效）；
// (3) manifest 列出的每個檔案都存在於磁碟（typo/改名沒跟上 = 擴充載入失敗）；
// (4) 依 manifest 宣告的順序實際載入後，selectPlatform 對三個平台都可用。
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const manifest = require(path.join(ROOT, "manifest.json"));

describe("manifest.json 的 content_scripts 載入順序", () => {
  assert.ok(
    Array.isArray(manifest.content_scripts) && manifest.content_scripts.length === 1,
    "本擴充預期恰有一組 content_scripts；新增組別時請一併更新本測試"
  );
  const js = manifest.content_scripts[0].js;

  it("js 陣列存在且 content.js 排在最後（平台檔與 i18n 檔必須先掛好全域）", () => {
    assert.ok(Array.isArray(js) && js.length > 0, "content_scripts[0].js 應為非空陣列");
    assert.strictEqual(
      js[js.length - 1],
      "content.js",
      "content.js 必須是最後一個載入的 script（它啟動時就讀 globalThis.RiddleDiary 與 i18n）"
    );
  });

  it("manifest 列出的每個 script 檔案都存在於磁碟", () => {
    for (const f of js) {
      assert.ok(fs.existsSync(path.join(ROOT, f)), `manifest 列出的 ${f} 不存在`);
    }
  });

  it("platforms/ 下的每個平台檔都列在 manifest（漏列 = 該平台瀏覽器端無聲失效）", () => {
    const platformFiles = fs
      .readdirSync(path.join(ROOT, "platforms"))
      .filter((f) => f.endsWith(".js"));
    assert.ok(platformFiles.length > 0, "platforms/ 不應為空");
    for (const f of platformFiles) {
      assert.ok(js.includes(`platforms/${f}`), `manifest 漏列 platforms/${f}`);
    }
  });

  it("i18n 檔都列在 manifest 且在 content.js 之前", () => {
    for (const f of ["i18n/messages.js", "i18n/i18n.js"]) {
      const idx = js.indexOf(f);
      assert.ok(idx !== -1, `manifest 漏列 ${f}`);
      assert.ok(idx < js.indexOf("content.js"), `${f} 必須在 content.js 之前載入`);
    }
  });

  it("依 manifest 順序載入後 selectPlatform 對三平台都可用", () => {
    // 全新 process：載入任何平台檔前，全域尚無 RiddleDiary（確保測試有意義、非恆真）
    assert.strictEqual(
      globalThis.RiddleDiary,
      undefined,
      "process 起始時不應已有 globalThis.RiddleDiary"
    );

    // 依 manifest 宣告的順序載入 content.js 以外的每個 script
    // （content.js 消費 location 等瀏覽器全域，不能在 Node 載入）
    for (const f of js.slice(0, -1)) {
      require(path.join(ROOT, f));
    }

    const api = globalThis.RiddleDiary;
    assert.ok(api, "平台檔載入後 globalThis.RiddleDiary 應存在");
    assert.strictEqual(typeof api.selectPlatform, "function", "selectPlatform 應為函式");

    for (const [host, id] of [
      ["claude.ai", "claude"],
      ["chatgpt.com", "chatgpt"],
      ["chat.openai.com", "chatgpt"],
      ["gemini.google.com", "gemini"],
    ]) {
      const result = api.selectPlatform(host);
      assert.ok(result !== null, `selectPlatform('${host}') 不應回傳 null`);
      assert.strictEqual(result.id, id, `selectPlatform('${host}').id 應為 '${id}'`);
    }
  });
});
