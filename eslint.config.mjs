import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Verbatim vendored copy of the bot's @dota2inhouse/core — not ours to
    // lint or edit; fixes belong upstream, then re-sync (see core/VENDORED.md).
    "src/lib/inhouse/core/**",
  ]),
]);

export default eslintConfig;
