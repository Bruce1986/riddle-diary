// eslint.config.js — ESLint v9 flat config
import js from "@eslint/js";

// 瀏覽器腳本使用的全域（chrome extension 環境 + 瀏覽器 API）
const browserGlobals = {
  // 瀏覽器標準
  window: "readonly",
  document: "readonly",
  location: "readonly",
  globalThis: "readonly",
  sessionStorage: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  InputEvent: "readonly",
  KeyboardEvent: "readonly",
  DocumentFragment: "readonly",
  // Chrome Extension API
  chrome: "readonly",
  // Node UMD 支援（platforms/*.js 的 UMD 包裝需要）
  module: "readonly",
};

// Node.js 測試檔使用的全域
const nodeGlobals = {
  require: "readonly",
  module: "readonly",
  process: "readonly",
  globalThis: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  console: "readonly",
};

export default [
  // 忽略 node_modules
  {
    ignores: ["node_modules/**"],
  },

  // 瀏覽器腳本：content.js、popup.js、platforms/*（.cjs 以 CommonJS/傳統 script 載入）
  {
    files: ["content.js", "popup.js", "platforms/**/*.cjs"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "script", // 傳統 script，不是 ES module
      globals: browserGlobals,
    },
    rules: {
      ...js.configs.recommended.rules,
      // content.js 的 catch (e) 刻意忽略例外（context 失效時的靜默降級），
      // 不要誤報未使用的 catch 參數
      "no-unused-vars": [
        "error",
        {
          vars: "all",
          args: "after-used",
          varsIgnorePattern: "^_",
          caughtErrors: "none", // catch 參數一律不報未使用
          ignoreRestSiblings: true,
        },
      ],
      // content.js 的 cleanText 函式裡 / /g 含有刻意的 U+00A0 NBSP（把 NBSP 替換成一般空格），是業務邏輯。
      // 用 skipRegExps 只放行 regex 內的 NBSP，其餘位置（變數名、運算子間等）仍會抓出意外的異常空白。
      "no-irregular-whitespace": ["error", { skipRegExps: true }],
    },
  },

  // 測試檔：Node.js 環境（.cjs 確保以 CommonJS 執行）
  {
    files: ["tests/**/*.cjs", "tests/**/*.js"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "commonjs",
      globals: nodeGlobals,
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["error", { vars: "all", args: "after-used" }],
    },
  },

  // eslint.config.js 本身是 ES module
  {
    files: ["eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      globals: nodeGlobals,
    },
  },
];
