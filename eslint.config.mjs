import tseslint from "typescript-eslint";

// TypeScript checks types/identifiers; ESLint checks control-flow mistakes.
export default [
  { ignores: ["node_modules/**", ".next/**", ".local/**", "next-env.d.ts"] },
  {
    files: ["src/**/*.{ts,tsx}", "lib/**/*.ts"],
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaVersion: "latest", sourceType: "module" } },
    rules: {
      "constructor-super": "error",
      "no-async-promise-executor": "error",
      "no-dupe-args": "error",
      "no-dupe-else-if": "error",
      "no-duplicate-case": "error",
      "no-fallthrough": "error",
      "no-unreachable": "error",
      "no-unsafe-finally": "error",
      "use-isnan": "error",
      "valid-typeof": "error",
    },
  },
];
