// tests/platforms.test.cjs — node:test 單元測試（CommonJS，搭配 UMD 的 require 載入）
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

// 先 require claude.cjs：UMD 會同時掛到 globalThis.RiddleDiary.platforms.claude
const claudePlatform = require("../platforms/claude.cjs");
// 再 require registry.cjs：此時 globalThis.RiddleDiary.platforms.claude 已存在
const { selectPlatform } = require("../platforms/registry.cjs");

// ─── 1. 平台 schema 完整性（動態走訪所有已註冊平台）─────────────────────────
// 不針對單一平台硬編碼：走訪 globalThis.RiddleDiary.platforms，對每個平台跑同一套
// schema 驗證。日後新增 ChatGPT/Gemini 等平台檔，CI 會自動納入、不必複製測試。

describe("平台 schema 完整性（動態走訪所有已註冊平台）", () => {
  const platforms = (globalThis.RiddleDiary && globalThis.RiddleDiary.platforms) || {};
  const ids = Object.keys(platforms);

  it("至少註冊一個平台", () => {
    assert.ok(ids.length > 0, "globalThis.RiddleDiary.platforms 不應為空");
  });

  for (const id of ids) {
    const platform = platforms[id];
    describe(`平台 '${id}'`, () => {
      it("是非 null 物件", () => {
        assert.strictEqual(typeof platform, "object");
        assert.ok(platform !== null);
      });

      it("id 是字串且等於註冊鍵", () => {
        assert.strictEqual(typeof platform.id, "string");
        assert.strictEqual(platform.id, id);
      });

      it("siteName 是非空字串", () => {
        assert.strictEqual(typeof platform.siteName, "string");
        assert.ok(platform.siteName.length > 0);
      });

      it("domains 是非空字串陣列且為標準 apex 網域格式", () => {
        assert.ok(Array.isArray(platform.domains));
        assert.ok(platform.domains.length > 0);
        for (const d of platform.domains) {
          assert.strictEqual(typeof d, "string");
          assert.ok(d.length > 0);
          // 標準網域：不得含前導點（.claude.ai）或萬用字元（*.claude.ai），
          // 否則 registry 的 endsWith("." + domain) 比對會失效
          assert.match(
            d,
            /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i,
            `domain '${d}' 應為標準網域格式（如 'claude.ai'），不含前導點或萬用字元`
          );
        }
      });

      it("persona 是非空字串", () => {
        assert.strictEqual(typeof platform.persona, "string");
        assert.ok(platform.persona.length > 0);
      });

      it("selectors 各必要鍵為非空字串", () => {
        const s = platform.selectors;
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
          assert.strictEqual(typeof s[key], "string", `selectors.${key} 應為字串`);
          assert.ok(s[key].length > 0, `selectors.${key} 不應為空字串`);
        }
      });

      it("isOverlayPath / isExistingConversationPath 是函式", () => {
        assert.strictEqual(typeof platform.isOverlayPath, "function");
        assert.strictEqual(typeof platform.isExistingConversationPath, "function");
      });

      it("writeStrategy 是字串", () => {
        assert.strictEqual(typeof platform.writeStrategy, "string");
      });

      it("features 是物件且 history 為布林", () => {
        assert.strictEqual(typeof platform.features, "object");
        assert.ok(platform.features !== null);
        assert.strictEqual(typeof platform.features.history, "boolean");
      });
    });
  }
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

  it("大寫 'CLAUDE.AI' → 不分大小寫回傳 claude 設定物件", () => {
    const result = selectPlatform("CLAUDE.AI");
    assert.ok(result !== null);
    assert.strictEqual(result.id, "claude");
  });

  it("尾隨點 'claude.ai.' (FQDN) → 移除尾隨點後回傳 claude 設定物件", () => {
    const result = selectPlatform("claude.ai.");
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

  it("非字串（null/undefined/number）→ 回傳 null，不丟例外", () => {
    assert.strictEqual(selectPlatform(null), null);
    assert.strictEqual(selectPlatform(undefined), null);
    assert.strictEqual(selectPlatform(123), null);
    assert.strictEqual(selectPlatform(), null);
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

  // 結束錨點：類似前綴但非對話頁的路徑不應誤判
  it("'/news' → false（不被 new 前綴誤判）", () => {
    assert.strictEqual(isOverlayPath("/news"), false);
  });

  it("'/new-feature' → false", () => {
    assert.strictEqual(isOverlayPath("/new-feature"), false);
  });

  it("'/recents-activity' → false", () => {
    assert.strictEqual(isOverlayPath("/recents-activity"), false);
  });

  it("'/new/' → true（容許結尾斜線）", () => {
    assert.strictEqual(isOverlayPath("/new/"), true);
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

// 註：「manifest 載入順序」測試已移到 tests/manifest-load.test.cjs。
// node --test 各測試檔在獨立 process 執行，那裡有天然乾淨的環境，
// 不需在此檔做 require.cache 備份/還原的脆弱操作。
