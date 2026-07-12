#!/usr/bin/env node
// scripts/mutation-check.js — 目標式突變驗證（mutation testing）
//
// 目的：確認 tests/content-spa.test.js 真的「咬得住」fix-loop 補回的每條保護。
// 做法：逐一把 content.js 的某條保護改壞（突變）→ 只跑 SPA 測試檔 →
// 預期至少一個測試轉紅（該突變被「殺掉」）→ git checkout 還原 → 下一條。
// 任何突變若測試仍全綠＝倖存（surviving mutant）＝該保護沒有測試把關，腳本以非零碼結束。
//
// 用法：npm run test:mutation（需 git 工作樹的 content.js 乾淨）
// 還原保證：每隻突變跑完即 git checkout 還原；例外／SIGINT／SIGTERM 也會在收尾 handler 還原。
// 前置：先跑一次未突變的基準測試，紅燈直接中止——否則套件本來就紅時每隻突變都「假 killed」。
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execSync, spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const TARGET = path.join(ROOT, "content.js");
const TEST_CMD = ["--test", "tests/content-spa.test.js"];

// 每條突變：name＝對應的保護；find 必須在 content.js 恰出現一次；replace＝改壞後的樣子
const MUTATIONS = [
  {
    name: "boot 不啟動 URL 監看（X2：初載非對話頁後永不補建）",
    find: "      watchUrlChanges();\n      bootComplete = true;",
    replace: "      bootComplete = true;",
  },
  {
    name: "busy 首訊轉址保護失效（X1：第一則回應被重置）",
    find: "if (wasNonConvo && PLATFORM.isExistingConversationPath(location.pathname) && busy) {",
    replace: "if (false) {",
  },
  {
    name: "hide-on-leave 失效（overlay 蓋死 /settings）",
    find: "      // 導航到非 overlay 頁（/settings、/login…）→ 隱藏日記，別蓋住頁面\n      if (!onOverlayPath()) {",
    replace: "      if (false) {",
  },
  {
    name: "回到對話頁不自動重現",
    find: "        overlay.classList.remove(\"rd-hidden\");\n        updateReopenVisibility();\n      }",
    replace: "        updateReopenVisibility();\n      }",
  },
  {
    name: "翻回按鈕失去 onOverlayPath guard（stale 按鈕可蓋設定頁）",
    find: "      } else if (onOverlayPath()) { // 非對話頁不重現（stale 按鈕不得把 overlay 蓋到設定頁上）",
    replace: "      } else {",
  },
  // 註：harness 的 chrome stub 有真 Chrome 的 self-echo 語意後，close 鈕的直接重啟與
  // storage onChanged 分支的重啟互為雙保險（真 Chrome 亦然）——單拔一條會被 echo 補位，
  // 故以複合突變驗整組機制。
  {
    name: "闔上後不重啟 URL 監看——直接與 echo 路徑整組失效（翻回按鈕不跟路由）",
    edits: [
      { find: "      watchUrlChanges(); // resetState 清了 urlWatchId：闔上期間仍要監看路由，翻回按鈕才會跟著顯示/隱藏\n", replace: "" },
      { find: "            watchUrlChanges(); // resetState 清了 urlWatchId：停用期間仍要監看路由，翻回按鈕才會跟著顯示/隱藏\n", replace: "" },
    ],
  },
  // 註：翻回／重新啟用的顯式 clear 與 resetState 的條件 clear 互為雙保險（main 原設計），
  // 單獨拔任一條會被另一條補位（單行突變會倖存＝冗餘防禦，非漏洞）。
  // 因此以「複合突變」驗整組機制：顯式 clear ＋ resetState 補位線一起拔。
  {
    name: "闔上→翻回 stale 清空機制整組失效（空白等 15 秒）",
    edits: [
      { find: "        lastRenderedNodes.clear(); // 翻回即是要立刻鋪上目前對話，不必等節點換新\n", replace: "" },
      { find: "    if (!state.enabled) lastRenderedNodes.clear();\n", replace: "" },
      { find: "              lastRenderedNodes.clear(); // 重新啟用即是要立刻鋪上目前對話，不必等節點換新\n", replace: "" },
    ],
  },
  {
    name: "popup 停用→啟用 stale 清空機制整組失效",
    edits: [
      { find: "              lastRenderedNodes.clear(); // 重新啟用即是要立刻鋪上目前對話，不必等節點換新\n", replace: "" },
      { find: "    if (!state.enabled) lastRenderedNodes.clear();\n", replace: "" },
    ],
  },
  {
    name: "翻回/重新啟用後不重啟 URL 監看——直接與 echo 路徑整組失效（overlay 蓋死頁面）",
    edits: [
      { find: "        startIntro();\n        watchUrlChanges();\n      }\n      updateReopenVisibility();", replace: "        startIntro();\n      }\n      updateReopenVisibility();" },
      { find: "              watchUrlChanges(); // resetState 清了 urlWatchId，必須重啟才能繼續偵測 SPA 換頁\n", replace: "" },
    ],
  },
  {
    name: "watcher 離開對話頁不清 lastRenderedNodes（同對話 /settings 來回卡 stale）",
    find: "      if (!PLATFORM.isExistingConversationPath(location.pathname)) lastRenderedNodes.clear();",
    replace: "",
  },
  {
    name: "staleness 檢查失效（換對話鋪錯內容）",
    find: "        const isStale = Array.from(nodes).some((node) => lastRenderedNodes.has(node));",
    replace: "        const isStale = false;",
  },
  {
    name: "載入輪詢砍半（慢網路提早收攤）",
    find: "      const MAX_TRIES = 50;",
    replace: "      const MAX_TRIES = 24;",
  },
  {
    name: "載入逾時退回空白開場白（誤導）",
    find: "          ink(t(\"load_fail\"), \"rd-diary\");",
    replace: "          showIntroLine(pen);",
  },
  {
    name: "insertText 失敗不 fail-fast（回退假成功）",
    find: "      ink(t(\"insert_fail\"), \"rd-diary\");\n      return false;\n    }",
    replace: "    }",
  },
  {
    name: "startTurn 失敗不重置 busy/佇列",
    find: "      busy = false;\n      queued.length = 0;\n      if (pen) pen.placeholder = t(\"pen_placeholder\");",
    replace: "      if (pen) pen.placeholder = t(\"pen_placeholder\");",
  },
  {
    name: "submit 先清輸入框再驗編輯器（吞字）",
    find: "    // 先驗證底層編輯器存在再清空輸入框：頁面異常時保留使用者辛苦打的字，不被吞掉。\n    if (text && !document.querySelector(SELECTORS.editor)) {\n      ink(t(\"no_editor\"), \"rd-diary\");\n      return;\n    }\n    pen.value = \"\";\n    pen.style.height = \"auto\";\n    if (!text) return;",
    replace: "    pen.value = \"\";\n    pen.style.height = \"auto\";\n    if (!text) return;\n    if (!document.querySelector(SELECTORS.editor)) {\n      ink(t(\"no_editor\"), \"rd-diary\");\n      return;\n    }",
  },
  {
    name: "220 拍逾時失去 !streaming（思考中被誤判無回應）",
    find: "        if (ticks > 220 && !streaming) return finish(timer, waiting, null);",
    replace: "        if (ticks > 220) return finish(timer, waiting, null);",
  },
  {
    name: "400 拍安全網失去 !streaming（長生成被腰斬）",
    find: "      if (ticks > 400 && !streaming) return finish(timer, waiting, lastText);",
    replace: "      if (ticks > 400) return finish(timer, waiting, lastText);",
  },
  {
    name: "outermost 去巢狀失效（同訊息渲染兩次）",
    find: "  function outermost(nodeList) {\n    const arr = Array.from(nodeList);",
    replace: "  function outermost(nodeList) {\n    return Array.from(nodeList);\n    // eslint-disable-next-line no-unreachable\n    const arr = Array.from(nodeList);",
  },
  {
    name: "開書防連點失效（開場白重複）",
    find: "    if (openBookTimer) return; // 動畫進行中：忽略連點，避免重複計時器與重複 startIntro",
    replace: "",
  },
  {
    name: "buildOverlay 不清殘留 overlay（擴充重載雙層）",
    find: "    const stale = document.getElementById(\"rd-overlay\");\n    if (stale) stale.remove();",
    replace: "",
  },
  {
    name: "翻回按鈕回退為重用殘留節點（死 closure）",
    find: "    const stale = document.getElementById(\"rd-reopen\");\n    if (stale) stale.remove();",
    replace: "    const staleReuse = document.getElementById(\"rd-reopen\");\n    if (staleReuse) return staleReuse;",
  },
  {
    name: "窺視鈕失去右鍵 guard（右鍵永久隱藏）",
    find: "      if (e.button !== 0) return; // 只允許滑鼠左鍵／觸控；右鍵會跳出選單干擾 pointerup 還原，導致永久隱藏",
    replace: "",
  },
  {
    name: "窺視鈕失去視窗失焦還原（alt-tab 永久隱藏）",
    find: "      window.addEventListener(\"blur\", peekRestore);",
    replace: "",
  },
  {
    name: "finish 不搶回焦點（輸入打進底層編輯器）",
    find: "        // sendToClaude 期間焦點被移到底層編輯器；回完後搶回日記輸入框，\n        // 否則使用者後續輸入會打進隱藏的底層編輯器，且 Enter 可能誤送。\n        pen.focus();",
    replace: "",
  },
  {
    name: "歷史標題去重 regex 退化 \\s+ → \\s*（「哈哈哈哈」誤切）",
    find: "      const dup = title.match(/^(.{2,}?)\\s+\\1$/);",
    replace: "      const dup = title.match(/^(.{2,}?)\\s*\\1$/);",
  },
  // 註：safeSameOriginPath 的「壞開」方向（不驗直接放行）在夾具可及範圍內不可觀測——
  // historyItem selector 限定 href^="/chat/"，餵不進 javascript:/跨源 href；該方向由 live 手測把關。
  // 此處驗「壞閉」方向（守門壞掉全擋）：孤兒對話將永遠無法 hard-reload。
  {
    name: "safeSameOriginPath 壞閉（歷史 fallback 全被擋）",
    find: "      if (u.origin === location.origin && u.protocol === \"https:\") {",
    replace: "      if (false) {",
  },
  {
    name: "cleanText 改用 textContent（多段落黏成一行）",
    find: "(clone.innerText || \"\")",
    replace: "(clone.textContent || \"\")",
  },
  {
    name: "ink 動畫後不合併 span（DOM 節點累積）",
    find: "        setTimeout(() => { if (line.isConnected) line.textContent = text; }, 500);",
    replace: "",
  },
];

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8" }).trim();
}

// 前置檢查：content.js 必須乾淨（腳本靠 git checkout 還原）
if (sh("git status --porcelain -- content.js") !== "") {
  console.error("✖ content.js 有未提交變更，mutation check 需要乾淨的 content.js（會用 git checkout 還原）");
  process.exit(2);
}

const original = fs.readFileSync(TARGET, "utf8");

// 收尾還原保證：例外、SIGINT、SIGTERM 都把 content.js 還原，絕不留突變在工作樹
let mutationOnDisk = false;
function restore() {
  if (mutationOnDisk) {
    fs.writeFileSync(TARGET, original);
    mutationOnDisk = false;
  }
}
process.on("exit", restore);
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => { restore(); process.exit(130); });
}

// 綠色基準：套件本來就紅的話，每隻突變都會「假 killed」→ 先驗未突變版必須全綠
{
  const base = spawnSync(process.execPath, TEST_CMD, { cwd: ROOT, encoding: "utf8" });
  if (base.status !== 0) {
    console.error("✖ 基準測試（未突變）已經是紅的——先修測試再跑 mutation check，否則結果無意義");
    process.exit(2);
  }
  console.log("✅ 基準測試全綠，開始突變");
}

const survivors = [];
const results = [];

for (const [i, m] of MUTATIONS.entries()) {
  const edits = m.edits || [{ find: m.find, replace: m.replace }];
  let mutated = original;
  for (const e of edits) {
    const count = mutated.split(e.find).length - 1;
    if (count !== 1) {
      console.error(`✖ [${i + 1}] 突變樣式非唯一（count=${count}）：${m.name} :: ${e.find.slice(0, 50)}`);
      process.exit(2);
    }
    mutated = mutated.replace(e.find, e.replace);
  }
  let run;
  try {
    mutationOnDisk = true;
    fs.writeFileSync(TARGET, mutated);
    run = spawnSync(process.execPath, TEST_CMD, { cwd: ROOT, encoding: "utf8" });
  } finally {
    restore(); // 原內容直接寫回（不依賴 git 狀態），例外也保證還原
  }
  const killed = run.status !== 0;
  results.push({ name: m.name, killed });
  console.log(`${killed ? "🗡  killed " : "🧟 SURVIVED"}  [${i + 1}/${MUTATIONS.length}] ${m.name}`);
  if (!killed) survivors.push(m.name);
}

console.log(`\n=== mutation check：${results.length - survivors.length}/${results.length} killed ===`);
if (survivors.length) {
  console.error("倖存突變（保護沒有測試把關）：");
  for (const s of survivors) console.error("  - " + s);
  process.exit(1);
}
console.log("全部突變被殺掉：SPA 測試對每條保護都有效把關。");
