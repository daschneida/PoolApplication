import globals from "globals";
export default [
  {
    files: ["src/**/*.js", "tests/**/*.mjs", "build.mjs"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { ...globals.browser, ...globals.node } },
    rules: { "no-undef": "error", "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_" }] }
  }
];
