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
    // Testy Playwright (e2e/**) to nie kod Next.js/React — fixture'y biorą
    // parametr `use`, co reguła react-hooks/rules-of-hooks błędnie czyta jako
    // wywołanie hooka `use()`.
    "e2e/**",
  ]),
]);

export default eslintConfig;
