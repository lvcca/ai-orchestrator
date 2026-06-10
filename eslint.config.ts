import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
  { 
    files: ["src/**/*.ts"],
    languageOptions: { 
      globals: {
        ...globals.browser, 
        ...globals.node
      }
    },
    basePath: "./src"
  },
  tseslint.configs.recommended,
]);