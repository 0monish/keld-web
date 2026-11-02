import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Official self-contained server output; public/static assets are added by
  // scripts/package-standalone.mjs after the build has succeeded.
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/output
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  // This project is deliberately separate from the KELD runtime monorepo.
  turbopack: { root: process.cwd() },
};

export default config;
