// tests/helpers/content-harness.js — content.js 的 SPA/DOM 行為測試載具
//
// 設計：jsdom 提供真 DOM；vm 把 manifest 宣告的 content script 依序載入
// jsdom 的全域環境；setTimeout/setInterval 在載入前換成「假時鐘」，
// 測試用 clock.tick(ms) 決定性推進時間（不 sleep、不 flake）。
// chrome.* 以同步 callback stub 模擬（safeStorageGet/initLocale 皆 callback 型），
// 因此 harness 建立完成的當下 boot() 已同步跑完。
//
// 每個測試呼叫 createHarness() 取得全新隔離環境（新 jsdom、新 vm context、
// 新時鐘、新 storage），測試之間零共享狀態。
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "../..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
const CONTENT_SCRIPTS = manifest.content_scripts[0].js; // registry → platforms → i18n → content.js

// vm.Script 編譯一次、多 context 重複執行（每個 harness 一個 context）
const scriptCache = new Map();
function compiled(rel) {
  if (!scriptCache.has(rel)) {
    scriptCache.set(
      rel,
      new vm.Script(fs.readFileSync(path.join(ROOT, rel), "utf8"), { filename: rel })
    );
  }
  return scriptCache.get(rel);
}

// ── 假時鐘：取代 window 的 setTimeout/setInterval，tick(ms) 依排程順序觸發 ──
function installClock(win) {
  let now = 0;
  let seq = 0;
  let nextId = 1;
  const tasks = new Map(); // id → {time, fn, interval, seq}

  win.setTimeout = (fn, delay, ...args) => {
    const id = nextId++;
    tasks.set(id, { time: now + Math.max(0, delay || 0), fn: () => fn(...args), interval: null, seq: seq++ });
    return id;
  };
  win.setInterval = (fn, delay, ...args) => {
    const id = nextId++;
    const step = Math.max(1, delay || 1);
    tasks.set(id, { time: now + step, fn: () => fn(...args), interval: step, seq: seq++ });
    return id;
  };
  win.clearTimeout = win.clearInterval = (id) => { tasks.delete(id); };

  return {
    // 推進 ms 毫秒，依時間（同時間依排程先後）觸發所有到期任務
    tick(ms) {
      const end = now + ms;
      for (;;) {
        let next = null;
        for (const [id, t] of tasks) {
          if (t.time > end) continue;
          if (!next || t.time < next.t.time || (t.time === next.t.time && t.seq < next.t.seq)) {
            next = { id, t };
          }
        }
        if (!next) break;
        now = next.t.time;
        if (next.t.interval != null) {
          next.t.time = now + next.t.interval;
          next.t.seq = seq++;
        } else {
          tasks.delete(next.id);
        }
        next.t.fn(); // 回呼內新排的任務同樣受 end 邊界管
      }
      now = end;
    },
    pendingCount() { return tasks.size; },
  };
}

// ── chrome stub：同步 callback、可注入 storage 初值、可觸發 onChanged ──
function installChrome(win, initialStorage) {
  const data = { ...initialStorage };
  const changeListeners = [];
  win.chrome = {
    runtime: {
      id: "test-extension-id",
      getURL: (p) => "chrome-extension://test-extension-id/" + p,
    },
    i18n: { getUILanguage: () => "zh-TW" },
    storage: {
      sync: {
        get(defaults, cb) { cb({ ...defaults, ...data }); },
        set(obj) { Object.assign(data, obj); },
      },
      onChanged: {
        addListener(fn) { changeListeners.push(fn); },
      },
    },
  };
  return {
    data,
    // 模擬 popup 等外部寫入：更新資料並觸發 onChanged listeners
    fire(changes) {
      for (const [k, v] of Object.entries(changes)) data[k] = v.newValue;
      for (const fn of changeListeners) fn(changes, "sync");
    },
  };
}

// ── claude.ai 頁面 DOM 夾具（選擇器對齊 platforms/claude.js）──
function makePage(win) {
  const doc = win.document;
  let host = doc.getElementById("host-fixture");
  if (!host) {
    host = doc.createElement("div");
    host.id = "host-fixture";
    doc.body.appendChild(host);
  }
  return {
    host,
    addEditor() {
      const ed = doc.createElement("div");
      ed.className = "ProseMirror";
      ed.setAttribute("contenteditable", "true");
      host.appendChild(ed);
      return ed;
    },
    addSendBtn() {
      const b = doc.createElement("button");
      b.setAttribute("aria-label", "Send message");
      host.appendChild(b);
      return b;
    },
    addStopBtn() {
      const b = doc.createElement("button");
      b.setAttribute("aria-label", "Stop response");
      b.id = "stop-btn-fixture";
      host.appendChild(b);
      return b;
    },
    removeStopBtn() {
      const b = doc.getElementById("stop-btn-fixture");
      if (b) b.remove();
    },
    addUserMsg(text) {
      const d = doc.createElement("div");
      d.setAttribute("data-testid", "user-message");
      d.textContent = text;
      host.appendChild(d);
      return d;
    },
    addResponse(text, { nestedInStreamingContainer = false } = {}) {
      const inner = doc.createElement("div");
      inner.className = "font-claude-message";
      inner.textContent = text;
      if (nestedInStreamingContainer) {
        const outer = doc.createElement("div");
        outer.setAttribute("data-is-streaming", "false");
        outer.appendChild(inner);
        host.appendChild(outer);
        return { outer, inner };
      }
      host.appendChild(inner);
      return { inner };
    },
    clearMessages() {
      host.querySelectorAll('[data-testid="user-message"], .font-claude-message, [data-is-streaming]')
        .forEach((n) => n.remove());
    },
  };
}

// ── 建立完整測試環境 ─────────────────────────────────────────────
// options:
//   url            初始網址（預設 claude.ai 的既有對話頁）
//   enabled        rd_enabled 初值（預設 true）
//   skipCover      預設 true：設 rd_skipcover 讓 buildOverlay 直接 startIntro
//   execCommand    "ok"（預設，回 true）| "fail"（回 false）| "absent"（不定義，走 catch）
//   beforeLoad(win, page)  content script 載入前的 hook（佈置初始 DOM 等）
function createHarness(options = {}) {
  const {
    url = "https://claude.ai/chat/test-1",
    enabled = true,
    skipCover = true,
    execCommand = "ok",
    beforeLoad = null,
  } = options;

  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url,
    runScripts: "outside-only",
    pretendToBeVisual: false,
  });
  const win = dom.window;
  const ctx = dom.getInternalVMContext();

  // jsdom 缺件補齊（只補測試需要的最小近似）
  if (!("innerText" in win.HTMLElement.prototype)) {
    Object.defineProperty(win.HTMLElement.prototype, "innerText", {
      configurable: true,
      get() { return this.textContent; },
      set(v) { this.textContent = v; },
    });
  }
  if (!win.CSS) win.CSS = {};
  if (typeof win.CSS.escape !== "function") {
    win.CSS.escape = (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => "\\" + c);
  }
  if (execCommand === "ok") {
    win.document.execCommand = () => true;
  } else if (execCommand === "fail") {
    win.document.execCommand = () => false;
  } // "absent"：不定義 → content.js 的 try/catch 走 inserted=false

  const clock = installClock(win);
  const chromeCtl = installChrome(win, {
    rd_enabled: enabled,
    rd_persona: true,
    language: "auto",
  });
  const page = makePage(win);

  if (skipCover) win.sessionStorage.setItem("rd_skipcover", "1");
  if (beforeLoad) beforeLoad(win, page);

  // 依 manifest 順序載入全部 content script（boot 於 content.js 載入時同步完成）
  for (const rel of CONTENT_SCRIPTS) {
    compiled(rel).runInContext(ctx);
  }

  const h = {
    win,
    doc: win.document,
    clock,
    page,
    chrome: chromeCtl,
    overlay: () => win.document.getElementById("rd-overlay"),
    feed: () => win.document.getElementById("rd-feed"),
    pen: () => win.document.getElementById("rd-pen"),
    reopenBtn: () => win.document.getElementById("rd-reopen"),
    // feed 內各行的純文字（span 動畫中也取整行 textContent）
    feedTexts() {
      const f = h.feed();
      return f ? Array.from(f.querySelectorAll(".rd-line")).map((l) => l.textContent) : [];
    },
    // SPA 導航（jsdom history.pushState 會同步更新 location，不重載頁面）
    nav(pathname) { win.history.pushState({}, "", pathname); },
    // 以 UI 事件送出訊息（等同使用者在羽毛筆輸入框按 Enter）
    type(text) {
      const pen = h.pen();
      pen.value = text;
      pen.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    },
    click(el) {
      el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
    },
    isHidden() {
      const ov = h.overlay();
      return !!ov && ov.classList.contains("rd-hidden");
    },
    cleanup() { win.close(); },
  };
  return h;
}

// i18n 字典（斷言訊息文字用，避免測試硬編中文字串漂移）
const messages = require(path.join(ROOT, "i18n/messages.js"));

module.exports = { createHarness, messages };
