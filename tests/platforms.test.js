// tests/platforms.test.js — node:test 單元測試（CommonJS，搭配 UMD 的 require 載入）
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// content.js 的 runtime 守衛刻意只做物件層級檢查，「每個必要鍵存在且非空」全權
// 委派給這份清單——它是唯一防線，靠下方的「與 content.js 實際用法同步」測試保證不會漏鍵。
const REQUIRED_SELECTOR_KEYS = [
  "editor",
  "sendBtn",
  "stopBtn",
  "response",
  "userMsg",
  "noise",
  "historyItem",
  "historyItemFallback",
];

// NOTE: this file intentionally loads platforms before registry to test bidirectional self-registration;
// manifest-load.test.js covers the canonical registry-first order.
// 刻意逆序（platforms 先、registry 後），驗證雙向自我注冊
const claudePlatform = require("../platforms/claude.js");
const chatgptPlatform = require("../platforms/chatgpt.js");
const geminiPlatform = require("../platforms/gemini.js");
// 再 require registry.js：此時三個平台都已掛上
const { selectPlatform } = require("../platforms/registry.js");

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
        for (const key of REQUIRED_SELECTOR_KEYS) {
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

      it("newChatPath 是非空字串", () => {
        assert.strictEqual(typeof platform.newChatPath, "string");
        assert.ok(platform.newChatPath.length > 0, "newChatPath 不應為空字串");
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

  it("'chatgpt.com' → 回傳 chatgpt 設定物件", () => {
    const result = selectPlatform("chatgpt.com");
    assert.ok(result !== null, "不應回傳 null");
    assert.strictEqual(result.id, "chatgpt");
  });

  it("'chat.openai.com' → 回傳 chatgpt 設定物件", () => {
    const result = selectPlatform("chat.openai.com");
    assert.ok(result !== null);
    assert.strictEqual(result.id, "chatgpt");
  });

  it("'gemini.google.com' → 回傳 gemini 設定物件", () => {
    const result = selectPlatform("gemini.google.com");
    assert.ok(result !== null);
    assert.strictEqual(result.id, "gemini");
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

  // 後綴仿冒防禦：比對必須是「完全相等或 '.' + domain 結尾」，
  // 退化成裸 endsWith(domain) 時這三例會誤配 —— 守住 registry.js 的仿冒註解。
  it("後綴仿冒 'evilclaude.ai' / 'notclaude.ai' / 'evilchatgpt.com' → 回傳 null", () => {
    assert.strictEqual(selectPlatform("evilclaude.ai"), null);
    assert.strictEqual(selectPlatform("notclaude.ai"), null);
    assert.strictEqual(selectPlatform("evilchatgpt.com"), null);
  });

  // 畸形平台設定的 skip 分支：registry 對 domains 非陣列／空字串元素應跳過，
  // 不丟例外、不誤配。暫時註冊畸形平台，finally 保證清除，不汙染其他測試。
  it("畸形平台（domains 非陣列/空字串/undefined）→ 跳過不誤配、不丟例外", () => {
    const platforms = globalThis.RiddleDiary.platforms;
    try {
      platforms.__badString = { id: "__badString", domains: "malformed.example" };
      platforms.__badEmpty = { id: "__badEmpty", domains: ["", "   "] };
      platforms.__badMissing = { id: "__badMissing" };
      // domains 為字串時不得被 for...of 逐字迭代而誤配
      assert.strictEqual(selectPlatform("malformed.example"), null);
      // 空字串/純空白 domain 不得讓任意 host 誤配
      assert.strictEqual(selectPlatform("anything.example"), null);
      // 畸形平台在場時，正常平台仍照常選中且不丟例外
      assert.strictEqual(selectPlatform("claude.ai").id, "claude");
      assert.strictEqual(selectPlatform("gemini.google.com").id, "gemini");
    } finally {
      delete platforms.__badString;
      delete platforms.__badEmpty;
      delete platforms.__badMissing;
    }
  });
});

// ─── 2b. REQUIRED_SELECTOR_KEYS 與 content.js 實際用法同步 ────────────────
// schema 測試的鍵清單是手寫的；這裡從 content.js 原始碼抽出實際消費的
// SELECTORS.<key>，斷言為清單子集——content.js 新用一個鍵而清單沒跟上時，CI 會紅。

describe("REQUIRED_SELECTOR_KEYS 與 content.js 實際用法同步", () => {
  it("content.js 消費的每個 SELECTORS.<key> 都在 REQUIRED_SELECTOR_KEYS 中", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../content.js"), "utf8");
    const used = new Set();
    for (const m of src.matchAll(/\bSELECTORS\.([A-Za-z_$][\w$]*)/g)) {
      used.add(m[1]);
    }
    assert.ok(used.size > 0, "content.js 應至少消費一個 SELECTORS 鍵（抽取 regex 可能失效）");
    for (const key of used) {
      assert.ok(
        REQUIRED_SELECTOR_KEYS.includes(key),
        `content.js 用到 SELECTORS.${key}，但 schema 測試的 REQUIRED_SELECTOR_KEYS 未涵蓋——請把該鍵加進清單（並確認各平台設定都有提供）`
      );
    }
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

// ─── 5. ChatGPT isOverlayPath ─────────────────────────────────────────────

describe("ChatGPT isOverlayPath", () => {
  const { isOverlayPath } = chatgptPlatform;

  // 應為 true（顯示覆蓋層）
  it("'/' → true（根路徑／新對話起點）", () => {
    assert.strictEqual(isOverlayPath("/"), true);
  });

  it("'/c/abc123def456ghi789jkl' → true（既有對話頁）", () => {
    assert.strictEqual(isOverlayPath("/c/abc123def456ghi789jkl"), true);
  });

  it("'/share/abc123' → true（分享連結）", () => {
    assert.strictEqual(isOverlayPath("/share/abc123"), true);
  });

  it("'/g/g-abc123-plugin' → true（GPT 頁）", () => {
    assert.strictEqual(isOverlayPath("/g/g-abc123-plugin"), true);
  });

  // 應為 false（不顯示覆蓋層）
  it("'/auth/login' → false", () => {
    assert.strictEqual(isOverlayPath("/auth/login"), false);
  });

  it("'/settings' → false", () => {
    assert.strictEqual(isOverlayPath("/settings"), false);
  });

  it("'/pricing' → false", () => {
    assert.strictEqual(isOverlayPath("/pricing"), false);
  });
});

// ─── 6. ChatGPT isExistingConversationPath ───────────────────────────────

describe("ChatGPT isExistingConversationPath", () => {
  const { isExistingConversationPath } = chatgptPlatform;

  it("'/c/550e8400-e29b-41d4-a716-446655440000' → true（標準 UUID 格式）", () => {
    assert.strictEqual(
      isExistingConversationPath("/c/550e8400-e29b-41d4-a716-446655440000"),
      true
    );
  });

  it("'/c/abcdef1234567890abcd' → true（20 字元英數）", () => {
    assert.strictEqual(
      isExistingConversationPath("/c/abcdef1234567890abcd"),
      true
    );
  });

  it("'/c/abc' → false（字串太短，未達 20 字元）", () => {
    assert.strictEqual(isExistingConversationPath("/c/abc"), false);
  });

  it("'/' → false", () => {
    assert.strictEqual(isExistingConversationPath("/"), false);
  });

  it("'/settings' → false", () => {
    assert.strictEqual(isExistingConversationPath("/settings"), false);
  });
});

// ─── 7. Gemini isOverlayPath ─────────────────────────────────────────────

describe("Gemini isOverlayPath", () => {
  const { isOverlayPath } = geminiPlatform;

  // 應為 true（顯示覆蓋層）
  it("'/app' → true（主應用根路徑）", () => {
    assert.strictEqual(isOverlayPath("/app"), true);
  });

  it("'/app/' → true（結尾斜線）", () => {
    assert.strictEqual(isOverlayPath("/app/"), true);
  });

  it("'/app/abc123def456' → true（既有對話頁）", () => {
    assert.strictEqual(isOverlayPath("/app/abc123def456"), true);
  });

  // 應為 false（不顯示覆蓋層）
  it("'/' → false（根路徑不是 Gemini 應用頁）", () => {
    assert.strictEqual(isOverlayPath("/"), false);
  });

  it("'/signin' → false", () => {
    assert.strictEqual(isOverlayPath("/signin"), false);
  });

  it("'/about' → false", () => {
    assert.strictEqual(isOverlayPath("/about"), false);
  });

  it("'/appstore' → false（避免前綴誤判：/app 不應匹配 /appstore）", () => {
    // isOverlayPath 用 /^\/app(\/|$)/ 確保只匹配 /app 或 /app/...，不匹配 /appstore
    assert.strictEqual(isOverlayPath("/appstore"), false);
  });
});

// ─── 8. Gemini isExistingConversationPath ────────────────────────────────

describe("Gemini isExistingConversationPath", () => {
  const { isExistingConversationPath } = geminiPlatform;

  it("'/app/abc123def456ghi789' → true", () => {
    assert.strictEqual(
      isExistingConversationPath("/app/abc123def456ghi789"),
      true
    );
  });

  it("'/app/ABCDEF123456' → true（大寫，不分大小寫）", () => {
    assert.strictEqual(isExistingConversationPath("/app/ABCDEF123456"), true);
  });

  it("'/app' → false（無 conversation id）", () => {
    assert.strictEqual(isExistingConversationPath("/app"), false);
  });

  it("'/' → false", () => {
    assert.strictEqual(isExistingConversationPath("/"), false);
  });

  it("'/signin' → false", () => {
    assert.strictEqual(isExistingConversationPath("/signin"), false);
  });
});

// ─── 9. personaLocales 跨平台一致性 ─────────────────────────────────────────

describe("personaLocales cross-platform consistency", () => {
  it("all platforms share identical personaLocales.zh_TW and .en (brand consistency)", () => {
    const allPlatforms = (globalThis.RiddleDiary && globalThis.RiddleDiary.platforms) || {};
    const locales = Object.values(allPlatforms).map((p) => p.personaLocales);
    assert.ok(locales.length > 0, "至少要有一個平台有 personaLocales");
    const zh = locales.map((l) => l && l.zh_TW);
    const en = locales.map((l) => l && l.en);
    zh.forEach((v) =>
      assert.strictEqual(v, zh[0], "zh_TW persona must match across platforms")
    );
    en.forEach((v) =>
      assert.strictEqual(v, en[0], "en persona must match across platforms")
    );
  });
});

// ─── 10. newChatPath 路徑格式 ────────────────────────────────────────────────

describe("newChatPath schema", () => {
  const allPlatforms = (globalThis.RiddleDiary && globalThis.RiddleDiary.platforms) || {};
  for (const [key, p] of Object.entries(allPlatforms)) {
    it(`${key}: newChatPath 以 / 開頭（same-origin 絕對路徑）`, () => {
      assert.match(
        p.newChatPath,
        /^\//,
        `${key}: newChatPath must be same-origin absolute path starting with /`
      );
    });
  }
});

// ─── 11. writeStrategy 枚舉值 ─────────────────────────────────────────────────

describe("writeStrategy enum", () => {
  // 已知的寫入策略：content.js 目前只實作 prosemirror；quill 是 gemini 的 T4-E TODO placeholder
  // （附有 canary console.warn）。未來新增策略時，先在 content.js 加分支再更新此清單。
  const VALID_WRITE_STRATEGIES = ["prosemirror", "quill"];
  const allPlatforms = (globalThis.RiddleDiary && globalThis.RiddleDiary.platforms) || {};
  for (const [key, p] of Object.entries(allPlatforms)) {
    it(`${key}: writeStrategy 是已知枚舉值之一`, () => {
      assert.ok(
        VALID_WRITE_STRATEGIES.includes(p.writeStrategy),
        `${key}: writeStrategy "${p.writeStrategy}" is not in allowed set [${VALID_WRITE_STRATEGIES.join(", ")}]`
      );
    });
  }
});

// 註：「manifest 載入順序」測試已移到 tests/manifest-load.test.js。
// node --test 各測試檔在獨立 process 執行，那裡有天然乾淨的環境，
// 不需在此檔做 require.cache 備份/還原的脆弱操作。
