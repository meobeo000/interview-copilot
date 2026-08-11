import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist", "dist-electron", "node_modules"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "vite.config.mts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      "@typescript-eslint/no-empty-object-type": "off"
    }
  }
);
