import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import markdown from "@eslint/markdown";
import css from "@eslint/css";
import { defineConfig } from "eslint/config";

export default defineConfig([
  { files: ["**/*.{js,mjs,cjs,ts,mts,cts}"], plugins: { js }, extends: ["js/recommended"], languageOptions: { globals: {...globals.browser, ...globals.node} } },
  tseslint.configs.recommended,
  { files: ["**/*.md"], plugins: { markdown }, language: "markdown/commonmark", extends: ["markdown/recommended"] },
  { files: ["**/*.css"], plugins: { css }, language: "css/css", extends: ["css/recommended"] },
]);

export default [
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        SpreadsheetApp: "readonly",
        HtmlService: "readonly",
        ContentService: "readonly",
        Logger: "readonly",
        Utilities: "readonly",
        Session: "readonly",
        ScriptApp: "readonly",
        Browser: "readonly",
        UrlFetchApp: "readonly",
        GmailApp: "readonly",
        DriveApp: "readonly"
      }
    },
    rules: {
      "no-redeclare": "error",
      "no-unused-vars": "warn",
      "no-undef": "error"
    }
  }
];