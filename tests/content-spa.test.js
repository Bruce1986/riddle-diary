// tests/content-spa.test.js — content.js SPA/DOM 行為的單元測試
//
// 覆蓋 fix-loop 補回的 main 加固保護（WORKLOG 2026-07-12）：每條保護至少一個
// 行為級測試，透過 tests/helpers/content-harness.js 的 jsdom＋假時鐘決定性驅動。
// 突變驗證：scripts/mutation-check.js 會逐一破壞這些保護、確認本檔會轉紅。
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createHarness, messages, claudePlatform } = require("./helpers/content-harness.js");

const zh = messages.zh_TW;

// 便利斷言：feed 內某行文字包含指定字串
function feedIncludes(h, snippet) {
  return h.feedTexts().some((t) => t.includes(snippet));
}

describe("啟動與 URL 監看", () => {
  it("在對話頁啟動：建立 overlay 並鋪上既有對話", () => {
    const h = createHarness({
      beforeLoad: (win, page) => {
        page.addUserMsg("你好");
        page.addResponse("哈囉，這是回覆");
      },
    });
    assert.ok(h.overlay(), "overlay 應建立");
    h.clock.tick(400);
    assert.deepEqual(h.feedTexts(), ["你好", "哈囉，這是回覆"]);
    h.cleanup();
  });

  it("初載於 /settings（非 overlay 路由）：不建 overlay；SPA 導回對話頁後補建", () => {
    const h = createHarness({
      url: "https://claude.ai/settings",
      beforeLoad: (win, page) => page.addUserMsg("舊訊息"),
    });
    assert.equal(h.overlay(), null, "非 overlay 路由不應建 overlay");
    h.nav("/chat/abc");
    h.clock.tick(700); // URL 監看輪詢一拍
    assert.ok(h.overlay(), "導航進對話頁後 overlay 應由監看補建");
    h.clock.tick(400);
    assert.ok(feedIncludes(h, "舊訊息"), "補建後應鋪上既有對話");
    h.cleanup();
  });

  it("停用狀態啟動於對話頁：不建 overlay，顯示翻回按鈕", () => {
    const h = createHarness({ enabled: false });
    assert.equal(h.overlay(), null);
    const btn = h.reopenBtn();
    assert.ok(btn, "翻回按鈕應存在");
    assert.ok(btn.classList.contains("rd-visible"), "翻回按鈕應可見");
    h.cleanup();
  });
});

describe("SPA 換頁", () => {
  it("對話→對話（非 busy）：重置並鋪上新對話內容", () => {
    const h = createHarness({
      beforeLoad: (win, page) => page.addUserMsg("對話A"),
    });
    h.clock.tick(400);
    assert.ok(feedIncludes(h, "對話A"));
    h.nav("/chat/other");
    h.clock.tick(700); // 監看偵測換頁 → 重置
    h.page.clearMessages(); // 模擬 React 換上新對話 DOM
    h.page.addUserMsg("對話B");
    h.clock.tick(900); // reloadTimer 500ms + introPoll 300ms
    assert.ok(feedIncludes(h, "對話B"), "應鋪上新對話");
    assert.ok(!feedIncludes(h, "對話A"), "舊對話不應殘留");
    h.cleanup();
  });

  it("首訊轉址保護：busy 中從 / 轉到 /chat/<id> 不得重置（第一則回應不遺失）", () => {
    const h = createHarness({
      url: "https://claude.ai/",
      beforeLoad: (win, page) => {
        page.addEditor();
        page.addSendBtn();
      },
    });
    h.type("第一則訊息");
    assert.ok(feedIncludes(h, "第一則訊息"), "使用者訊息應上畫面");
    assert.ok(feedIncludes(h, zh.ink_waiting), "回應等待線應存在");
    h.nav("/chat/fresh-id"); // 平台把新對話重導到對話路徑
    h.clock.tick(1400); // 監看跑兩拍
    assert.ok(feedIncludes(h, "第一則訊息"), "busy 中轉址不得清空 feed");
    assert.ok(feedIncludes(h, zh.ink_waiting), "回應 watcher 不得被殺");
    // 回應到來 → 正常完成本回合
    h.page.addResponse("第一則回覆");
    h.clock.tick(300 * 12);
    assert.ok(feedIncludes(h, "第一則回覆"), "第一則回應應被渲染");
    h.cleanup();
  });

  it("導航到 /settings：隱藏 overlay；導回對話頁：自動重現並重鋪", () => {
    const h = createHarness({
      beforeLoad: (win, page) => page.addUserMsg("內容"),
    });
    h.clock.tick(400);
    h.nav("/settings");
    h.clock.tick(700);
    assert.ok(h.isHidden(), "非 overlay 頁應隱藏日記（別蓋住設定頁）");
    h.nav("/chat/test-1");
    h.clock.tick(700 + 900);
    assert.ok(!h.isHidden(), "回到對話頁應自動重現（仍 enabled）");
    assert.ok(feedIncludes(h, "內容"), "重現後應重鋪內容");
    h.cleanup();
  });

  it("闔上後換頁：翻回按鈕的顯示跟著路由", () => {
    const h = createHarness({
      beforeLoad: (win, page) => page.addUserMsg("內容"),
    });
    h.clock.tick(400);
    h.click(h.doc.getElementById("rd-close"));
    const btn = h.reopenBtn();
    assert.ok(btn.classList.contains("rd-visible"), "闔上後於對話頁按鈕應可見");
    h.nav("/settings");
    h.clock.tick(700);
    assert.ok(!btn.classList.contains("rd-visible"), "到 /settings 按鈕應隱藏");
    h.nav("/chat/test-1");
    h.clock.tick(700);
    assert.ok(btn.classList.contains("rd-visible"), "回到對話頁按鈕應重現");
    h.cleanup();
  });

  it("stale 翻回按鈕防護：於非 overlay 路由點翻回，不得把 overlay 蓋上去", () => {
    const h = createHarness({
      beforeLoad: (win, page) => page.addUserMsg("內容"),
    });
    h.clock.tick(400);
    h.click(h.doc.getElementById("rd-close"));
    h.nav("/settings");
    h.clock.tick(700);
    h.click(h.reopenBtn()); // 硬點（真實情境：visibility 沒跟上的殘留按鈕）
    assert.ok(h.isHidden(), "非 overlay 路由點翻回不得重現 overlay");
    h.cleanup();
  });
});

describe("闔上／翻回 與 staleness 生命週期", () => {
  it("同一對話闔上→翻回：立即重鋪（不得誤判 stale 等 15 秒）", () => {
    const h = createHarness({
      beforeLoad: (win, page) => page.addUserMsg("同一段對話"),
    });
    h.clock.tick(400);
    assert.ok(feedIncludes(h, "同一段對話"));
    h.click(h.doc.getElementById("rd-close"));
    assert.ok(h.isHidden());
    h.click(h.reopenBtn());
    assert.ok(!h.isHidden(), "翻回應立即重現");
    h.clock.tick(350); // introPoll 第一拍就該渲染
    assert.ok(feedIncludes(h, "同一段對話"), "翻回後第一拍即應重鋪，不得空白等待");
    h.cleanup();
  });

  it("翻回後 URL 監看必須重啟：翻回→導航到 /settings 應隱藏、不得蓋住頁面", () => {
    const h = createHarness({
      beforeLoad: (win, page) => page.addUserMsg("內容"),
    });
    h.clock.tick(400);
    h.click(h.doc.getElementById("rd-close"));
    h.click(h.reopenBtn()); // 翻回：resetState 清了 urlWatchId，兩條重啟路徑（click 直接／echo）都要驗
    assert.ok(!h.isHidden());
    h.nav("/settings");
    h.clock.tick(1400);
    assert.ok(h.isHidden(), "翻回後監看必須繼續運作：到 /settings 應隱藏（否則 overlay 蓋死頁面）");
    h.cleanup();
  });

  it("popup 重新啟用後 URL 監看必須重啟：啟用→導航到 /settings 應隱藏", () => {
    const h = createHarness({
      beforeLoad: (win, page) => page.addUserMsg("內容"),
    });
    h.clock.tick(400);
    h.chrome.fire({ rd_enabled: { newValue: false } });
    h.chrome.fire({ rd_enabled: { newValue: true } });
    assert.ok(!h.isHidden());
    h.nav("/settings");
    h.clock.tick(1400);
    assert.ok(h.isHidden(), "重新啟用後監看必須繼續運作：到 /settings 應隱藏");
    h.cleanup();
  });

  it("staleness 保護：換對話後舊 DOM 未卸載前不鋪、換新後才鋪", () => {
    const h = createHarness({
      beforeLoad: (win, page) => page.addUserMsg("上一段對話"),
    });
    h.clock.tick(400);
    h.nav("/chat/next");
    h.clock.tick(700); // 重置 + 排 startIntro
    h.clock.tick(500 + 300 * 3); // 舊節點仍在 DOM：introPoll 應持續等待
    assert.deepEqual(h.feedTexts(), [], "舊 DOM 未換新前不得鋪上（防鋪錯對話）");
    h.page.clearMessages();
    h.page.addUserMsg("新一段對話");
    h.clock.tick(300);
    assert.ok(feedIncludes(h, "新一段對話"), "DOM 換新後應立即鋪上");
    assert.ok(!feedIncludes(h, "上一段對話"));
    h.cleanup();
  });

  it("慢速載入容忍：訊息 10 秒後才出現仍應鋪上（輪詢不得提早收攤）", () => {
    const h = createHarness(); // 對話頁、一開始沒有任何訊息
    h.clock.tick(10000); // 慢網路：10 秒後內容才到（約第 33 拍，仍在 50 拍內）
    h.page.addUserMsg("遲到的內容");
    h.clock.tick(600);
    assert.ok(feedIncludes(h, "遲到的內容"), "10 秒內到達的內容仍應鋪上");
    assert.ok(!feedIncludes(h, zh.load_fail), "不得提早判定載入失敗");
    h.cleanup();
  });

  it("載入逾時：對話頁 15 秒仍無訊息 → 顯示明確載入失敗，而非空白開場白", () => {
    const h = createHarness(); // 對話頁、無任何訊息節點
    h.clock.tick(300 * 52); // 超過 MAX_TRIES=50
    assert.ok(feedIncludes(h, zh.load_fail), "應顯示 load_fail 錯誤");
    assert.ok(!feedIncludes(h, zh.intro_line), "不得顯示誤導的空白頁開場白");
    h.cleanup();
  });
});

describe("送出與回應", () => {
  it("insertText 失敗 fail-fast：立即提示、busy 立刻釋放（不卡 36 秒）", () => {
    const h = createHarness({
      execCommand: "fail",
      beforeLoad: (win, page) => {
        page.addEditor();
        page.addSendBtn();
        page.addUserMsg("既有訊息");
      },
    });
    h.clock.tick(400); // 初始渲染完成（introPoll 收攤），之後才進使用者回合
    h.type("寫不進去的訊息");
    assert.ok(feedIncludes(h, zh.insert_fail), "應立即顯示 insert_fail");
    assert.equal(h.pen().placeholder, zh.pen_placeholder, "placeholder 應立即還原（busy 已釋放）");
    h.type("第二則");
    assert.ok(feedIncludes(h, "第二則"), "busy 已釋放：第二則應直接進入新回合，不得卡佇列");
    h.cleanup();
  });

  it("無編輯器保護：先驗編輯器再清輸入框，使用者文字不被吞", () => {
    const h = createHarness(); // 不加 editor 夾具
    const pen = h.pen();
    pen.value = "辛苦打的字";
    pen.dispatchEvent(new h.win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    assert.ok(feedIncludes(h, zh.no_editor), "應提示無法連到輸入框");
    assert.equal(pen.value, "辛苦打的字", "輸入框內容必須保留");
    h.cleanup();
  });

  it("正常回合：回應渲染完成後 busy 釋放、焦點回到日記輸入框", () => {
    const h = createHarness({
      beforeLoad: (win, page) => {
        page.addEditor();
        page.addSendBtn();
        page.addUserMsg("既有訊息");
      },
    });
    h.clock.tick(400); // 初始渲染完成
    h.type("問題");
    assert.ok(feedIncludes(h, zh.ink_waiting), "送出後等待線應存在");
    h.page.addResponse("答案內容");
    h.clock.tick(300 * 12); // watchResponse stableTicks >= 8 → finish
    h.clock.tick(2000); // 墨水動畫 + after()
    assert.ok(feedIncludes(h, "答案內容"), "回應應渲染");
    assert.ok(!feedIncludes(h, zh.ink_waiting), "等待線應移除");
    assert.equal(h.pen().placeholder, zh.pen_placeholder, "busy 應釋放");
    assert.equal(h.doc.activeElement, h.pen(), "焦點應回到日記輸入框（防輸入打進底層編輯器）");
    h.cleanup();
  });

  it("!streaming 逾時保護：串流中 220+ 拍不得誤判無回應；串流結束才收尾", () => {
    const h = createHarness({
      beforeLoad: (win, page) => {
        page.addEditor();
        page.addSendBtn();
        page.addUserMsg("既有訊息");
      },
    });
    h.clock.tick(400); // 初始渲染完成
    h.type("長思考的問題");
    h.page.addStopBtn(); // 進入串流（thinking 中，回應文字被雜訊過濾成空）
    h.clock.tick(300 * 230); // 遠超 220 拍
    assert.ok(feedIncludes(h, zh.ink_waiting), "串流中不得逾時收尾（等待線仍在）");
    assert.ok(!feedIncludes(h, zh.no_echo), "串流中不得誤判為無回音");
    h.page.removeStopBtn(); // 串流結束、仍無內容
    h.clock.tick(300 * 3);
    h.clock.tick(2000);
    assert.ok(feedIncludes(h, zh.no_echo), "非串流後才允許逾時收尾");
    h.cleanup();
  });

  it("長文生成安全網：串流中文字持續變長，不得在 400 拍被腰斬", () => {
    const h = createHarness({
      beforeLoad: (win, page) => {
        page.addEditor();
        page.addSendBtn();
        page.addUserMsg("既有訊息");
      },
    });
    h.clock.tick(400);
    h.type("超長的請求");
    h.page.addStopBtn(); // 串流中
    const { inner } = h.page.addResponse("開頭");
    for (let i = 0; i < 45; i++) { // 45 × 10 拍 = 450 拍，全程文字持續變長
      h.clock.tick(3000);
      inner.textContent += "更多內容";
    }
    assert.ok(feedIncludes(h, zh.ink_waiting), "串流中持續生成不得被 400 拍安全網腰斬");
    h.page.removeStopBtn(); // 串流結束
    h.clock.tick(300 * 5);
    h.clock.tick(70 * 130 + 1500); // 渲染動畫
    assert.ok(!feedIncludes(h, zh.ink_waiting), "串流結束後應正常收尾");
    h.cleanup();
  });

  it("busy 中的第二則訊息進佇列，回合結束自動依序送出", () => {
    const h = createHarness({
      beforeLoad: (win, page) => {
        page.addEditor();
        page.addSendBtn();
        page.addUserMsg("既有訊息");
      },
    });
    h.clock.tick(400);
    h.type("第一問");
    h.type("排隊訊息"); // busy 中 → 進佇列，不立即上畫面
    assert.ok(!feedIncludes(h, "排隊訊息"), "busy 中的訊息應排隊、不得立即送出");
    h.page.addResponse("第一答");
    h.clock.tick(300 * 12); // 第一回合 finish
    h.clock.tick(3000); // 動畫 + after() → 佇列自動送出
    assert.ok(feedIncludes(h, "第一答"));
    assert.ok(feedIncludes(h, "排隊訊息"), "回合結束後佇列訊息應自動送出（免再按 Enter）");
    h.page.addResponse("第二答");
    h.clock.tick(300 * 12 + 2500); // 第二回合 finish
    assert.ok(feedIncludes(h, "第二答"), "佇列回合應正常完成");
    h.cleanup();
  });

  it("persona 只在本次載入的第一則訊息前置一次", () => {
    const personaZh = claudePlatform.personaLocales.zh_TW;
    const h = createHarness({
      beforeLoad: (win, page) => {
        page.addEditor();
        page.addSendBtn();
        page.addUserMsg("既有訊息");
      },
    });
    h.clock.tick(400);
    h.type("訊息一");
    const inserts = h.insertedTexts();
    assert.equal(inserts.length, 1);
    assert.ok(inserts[0].startsWith(personaZh), "第一則應前置 persona（依 locale 選 zh_TW）");
    assert.ok(inserts[0].endsWith("訊息一"), "persona 後應接使用者文字");
    h.page.addResponse("回一");
    h.clock.tick(300 * 12);
    h.clock.tick(2000);
    h.type("訊息二");
    assert.equal(h.insertedTexts()[1], "訊息二", "第二則不得再前置 persona");
    h.cleanup();
  });

  it("ink 長文動畫結束後合併回純文字（不殘留上百個 span）", () => {
    const long = "很長的回覆".repeat(60); // 300 字
    const h = createHarness({
      beforeLoad: (win, page) => {
        page.addEditor();
        page.addSendBtn();
        page.addUserMsg("既有訊息");
      },
    });
    h.clock.tick(400); // 初始渲染完成
    h.type("問");
    h.page.addResponse(long);
    h.clock.tick(300 * 12); // finish → ink(long)
    h.clock.tick(65 * 110 + 1000); // 分批動畫（≤~120 拍）+ 500ms 合併
    const line = Array.from(h.feed().querySelectorAll(".rd-line")).find((l) => l.textContent === long);
    assert.ok(line, "長回覆應完整渲染");
    assert.equal(line.querySelectorAll("span").length, 0, "動畫後 span 應合併回純文字");
    h.cleanup();
  });
});

describe("渲染保護", () => {
  it("多段落回應：段落邊界保留換行，不得黏成一行（cleanText 依賴 innerText 語意）", () => {
    const h = createHarness({
      beforeLoad: (win, page) => page.addResponseParas(["第一段內容", "第二段內容"]),
    });
    h.clock.tick(400);
    const line = Array.from(h.feed().querySelectorAll(".rd-line")).find((l) =>
      l.textContent.includes("第一段內容")
    );
    assert.ok(line, "多段落回應應渲染");
    assert.ok(
      line.textContent.includes("第一段內容\n第二段內容"),
      "段落之間必須保留換行（textContent=" + JSON.stringify(line.textContent) + "）"
    );
    h.cleanup();
  });

  it("outermost 去巢狀：容器與子元素同時命中選擇器時只渲染一次", () => {
    const h = createHarness({
      beforeLoad: (win, page) => {
        page.addResponse("同一則訊息", { nestedInStreamingContainer: true });
      },
    });
    h.clock.tick(400);
    const lines = h.feedTexts().filter((t) => t.includes("同一則訊息"));
    assert.equal(lines.length, 1, "巢狀命中不得重複渲染");
    h.cleanup();
  });

  it("開書動畫防連點：連點書封只產生一條開場白", () => {
    const h = createHarness({ url: "https://claude.ai/", skipCover: false });
    const cover = h.doc.getElementById("rd-cover");
    assert.ok(cover, "書封應存在");
    h.click(cover);
    h.click(cover); // 動畫中連點
    h.clock.tick(900 + 3000);
    const intros = h.feedTexts().filter((t) => t.includes(zh.intro_line));
    assert.equal(intros.length, 1, "開場白只能有一條");
    h.cleanup();
  });
});

describe("擴充重載殘留清理", () => {
  it("boot 前殘留的 #rd-overlay / #rd-fontface：重建而不疊層", () => {
    const h = createHarness({
      beforeLoad: (win, page) => {
        const stale = win.document.createElement("div");
        stale.id = "rd-overlay";
        stale.setAttribute("data-stale", "1");
        win.document.documentElement.appendChild(stale);
        const staleFont = win.document.createElement("style");
        staleFont.id = "rd-fontface";
        staleFont.setAttribute("data-stale", "1");
        win.document.documentElement.appendChild(staleFont);
        page.addUserMsg("內容");
      },
    });
    const overlays = h.doc.querySelectorAll("#rd-overlay");
    assert.equal(overlays.length, 1, "只能有一層 overlay");
    assert.ok(!overlays[0].hasAttribute("data-stale"), "殘留的舊 overlay 應被移除重建");
    assert.equal(h.doc.querySelectorAll("#rd-fontface").length, 1, "字型樣式不得重複注入");
    h.cleanup();
  });

  it("boot 前殘留的 #rd-reopen（舊世代 closure）：移除重建，翻回功能不失效", () => {
    const h = createHarness({
      enabled: false,
      beforeLoad: (win) => {
        const staleBtn = win.document.createElement("button");
        staleBtn.id = "rd-reopen";
        staleBtn.setAttribute("data-stale", "1");
        win.document.documentElement.appendChild(staleBtn);
      },
    });
    const btns = h.doc.querySelectorAll("#rd-reopen");
    assert.equal(btns.length, 1, "只能有一顆翻回按鈕");
    assert.ok(!btns[0].hasAttribute("data-stale"), "殘留舊按鈕應被移除重建（舊 closure 已死）");
    h.click(btns[0]);
    assert.ok(h.overlay(), "新按鈕的 click handler 應為本世代：點擊要能建 overlay");
    h.cleanup();
  });
});

describe("窺視鈕防護", () => {
  it("右鍵不觸發窺視；左鍵按住以 opacity 隱藏、視窗失焦自動還原", () => {
    const h = createHarness({
      beforeLoad: (win, page) => page.addUserMsg("內容"),
    });
    h.clock.tick(400);
    const peek = h.doc.getElementById("rd-peek");
    const ov = h.overlay();
    peek.dispatchEvent(new h.win.MouseEvent("pointerdown", { button: 2, bubbles: true, cancelable: true }));
    assert.equal(ov.style.opacity, "", "右鍵不得觸發窺視（context menu 會吃掉 pointerup → 永久隱藏）");
    peek.dispatchEvent(new h.win.MouseEvent("pointerdown", { button: 0, bubbles: true, cancelable: true }));
    assert.equal(ov.style.opacity, "0", "左鍵按住應以 opacity 隱藏");
    assert.equal(ov.style.pointerEvents, "none");
    h.win.dispatchEvent(new h.win.Event("blur")); // alt-tab / 視窗外放開
    assert.equal(ov.style.opacity, "", "視窗失焦應自動還原，不得永久隱藏");
    h.cleanup();
  });
});

describe("popup 開關（storage.onChanged）", () => {
  it("停用→啟用：隱藏後重新啟用立即重鋪目前對話", () => {
    const h = createHarness({
      beforeLoad: (win, page) => page.addUserMsg("目前對話"),
    });
    h.clock.tick(400);
    h.chrome.fire({ rd_enabled: { newValue: false } });
    assert.ok(h.isHidden(), "popup 停用應隱藏");
    assert.ok(h.reopenBtn().classList.contains("rd-visible"), "停用後翻回按鈕應可見");
    h.chrome.fire({ rd_enabled: { newValue: true } });
    assert.ok(!h.isHidden(), "重新啟用應重現");
    h.clock.tick(350);
    assert.ok(feedIncludes(h, "目前對話"), "重新啟用第一拍即應重鋪（不等 stale 逾時）");
    h.cleanup();
  });

  it("於 /settings 重新啟用：overlay 維持隱藏、不蓋住頁面", () => {
    const h = createHarness({
      beforeLoad: (win, page) => page.addUserMsg("內容"),
    });
    h.clock.tick(400);
    h.nav("/settings");
    h.clock.tick(700);
    assert.ok(h.isHidden());
    h.chrome.fire({ rd_enabled: { newValue: false } });
    h.chrome.fire({ rd_enabled: { newValue: true } });
    assert.ok(h.isHidden(), "非 overlay 路由上重新啟用不得重現 overlay");
    h.cleanup();
  });
});
