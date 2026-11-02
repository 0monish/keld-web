const result = await Bun.build({
  entrypoints: ["lint-rules/index.ts"],
  outdir: "lint-rules/dist",
  target: "node",
  format: "esm",
  naming: "[name].mjs",
  minify: true,
});

if (!result.success) {
  console.error("Build failed:", result.logs);
  // @ts-expect-error Bun types are available but `exit()` never returns — noUnusedLocals safety
  Bun.exit(1);
}

export {};
