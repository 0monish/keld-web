import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "react", "nextjs", "jsx-a11y"],
  jsPlugins: [
    {
      name: "project-local",
      specifier: "./lint-rules/dist/index.mjs",
    },
  ],
  categories: {
    correctness: "error",
  },
  ignorePatterns: [
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".agents/**",
    "design/**",
    "public/**",
    "lint-rules/**",
    "scripts/clean-workspace.ts",
  ],
  rules: {
    "project-local/max-file-lines": "warn",
    "project-local/no-nodejs-imports": "error",
    "project-local/no-nodejs-in-client": "error",
    "project-local/prefer-src-alias": "error",
    "project-local/no-exported-types-in-source": "error",
    "project-local/require-live-form-validation": "error",
    "project-local/sort-types-and-keys": "error",
    "project-local/tailwind-canonical-classes": "warn",
    "no-restricted-properties": [
      "error",
      {
        object: "process",
        property: "argv",
        message: "Use Bun or file-local APIs instead of process.argv in Bun-managed files.",
      },
      {
        object: "process",
        property: "cwd",
        message: "Use Bun or file-local APIs instead of process.cwd in Bun-managed files.",
      },
      {
        object: "process",
        property: "env",
        message: "Use Bun or file-local APIs instead of process.env in Bun-managed files.",
      },
      {
        object: "process",
        property: "exit",
        message: "Use Bun or file-local APIs instead of process.exit in Bun-managed files.",
      },
    ],
    "no-unused-vars": [
      "warn",
      {
        args: "after-used",
        argsIgnorePattern: "^_",
        caughtErrors: "all",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        ignoreRestSiblings: true,
        varsIgnorePattern: "^_",
      },
    ],
    "sort-imports": [
      "error",
      {
        ignoreDeclarationSort: true,
        ignoreCase: true,
      },
    ],
    "typescript/consistent-type-imports": "error",
    "typescript/no-explicit-any": "error",
    "jsx-a11y/prefer-tag-over-role": "off",
  },
  overrides: [
    {
      files: ["src/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                regex: "^(?:\\.\\./)+",
                message: "Use @/ absolute imports instead of parent-relative imports inside src.",
              },
            ],
          },
        ],
      },
    },
    {
      files: [
        "scripts/package-standalone.mjs",
        "scripts/check-production-access.mjs",
        "next.config.ts",
      ],
      rules: {
        "project-local/no-nodejs-imports": "off",
        "no-restricted-properties": "off",
      },
    },
  ],
});
