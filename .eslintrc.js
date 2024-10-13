module.exports = {
  env: {
    commonjs: true,
    es2021: true,
    node: true,
  },
  extends: [
    "plugin:prettier/recommended",
    "prettier",
    "eslint:recommended",
    "plugin:promise/recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  parserOptions: {
    ecmaVersion: "latest",
    allowImportExportEverywhere: false,
  },
  parser: "@typescript-eslint/parser",
  plugins: ["unused-imports", "no-relative-import-paths", "@typescript-eslint", "import"],
  rules: {
    "@typescript-eslint/consistent-type-imports": "error",
    "unused-imports/no-unused-imports": "error",
    "no-empty": ["error", { allowEmptyCatch: true }],
    "promise/no-nesting": "off",
    "promise/always-return": "off",
    "prefer-const": "error",
    "@typescript-eslint/no-use-before-define": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        args: "none",
      },
    ],
    "no-console": ["error"],
    "promise/catch-or-return": [
      "error",
      {
        allowFinally: true,
      },
    ],

    "no-relative-import-paths/no-relative-import-paths": ["error", { prefix: "@" }],
    "import/no-dynamic-require": 0,
    "no-underscore-dangle": ["error", { allow: ["_id"] }],
    "import/no-unassigned-import": "error",
    "prettier/prettier": [
      "error",
      {
        endOfLine: "auto",
      },
    ],
  },
  root: true,
  ignorePatterns: [`environment.d.ts`, `v1/*`],
  settings: {
    "import/resolver": {
      node: {
        extensions: [".js", ".jsx", ".ts", ".tsx"],
      },
    },
    "import/no-unassigned-import": {},
  },
};
