# KELD Website

The public website for **KELD**, a GYLDLAB project exploring a different foundation for desktop applications: a Rust native host, application logic in Bun, and the operating system's webview.

This repository contains the **website**, not the [KELD framework](https://github.com/gyldlab/keld). KELD itself is in pre-alpha development. The website's capabilities and visuals must not be interpreted as a general availability or production-readiness claim for the framework.

## Technology

Next.js 16.4.3 (App Router), React 19, TypeScript, Tailwind CSS v4 (for the branded footer), Three.js for the interactive 3D hero, lil-gui for the optional scene editor, and a deferred Paper Shaders liquid-metal treatment for the GYLDLAB and KELD footer marks.

The hero uses **on-demand WebGL rendering**. The scene stops rendering when idle; it does not use progressive path tracing on the homepage. The viewer can fall back to an explicit error/retry state if WebGL is unavailable.

## Development

Requires [Bun](https://bun.sh/) **1.4.4** and Node.js **22.18+**.

```sh
bun install --frozen-lockfile
bun run dev
```

Open http://localhost:3000. The interactive Scene Lab can also be opened at `/lab/motion`. Editor adjustments and imported JSON presets are stored in the browser; they do not modify Blender models or server-side files.

## Quality and release build

```sh
bun run fmt:check
bun run lint
bun run typecheck
bun run build:release
```

`build:release` produces `.next/standalone/` and packages the browser chunks and `public/` assets alongside Next.js's standalone server. For a self-hosted Node.js production preview, run:

```sh
HOSTNAME=127.0.0.1 PORT=3000 NODE_ENV=production node .next/standalone/server.js
```

For an external launch, configure an HTTPS reverse proxy, health monitoring, domain/DNS, and platform-specific deployment controls. **Pushing GitHub source does not itself deploy the site.** The `.next/`, `node_modules/`, local Blender studies, large original texture packs, and test screenshots are intentionally excluded from Git.

The repository includes a GitHub Actions workflow that checks formatting, lint rules, TypeScript, and the standalone release build on pushes and pull requests.

## Website structure

- `src/app/` — pages, metadata, base styles, and Tailwind entry.
- `src/components/hero/scene-runtime.ts` — active live Three.js scene, shadow mapping, camera, and render-on-demand behavior.
- `src/components/hero/editor/` — optional editor, scene presets, and texture switching.
- `src/components/brand/` — deferred footer logo components; the original CRAZY COLLECTION GYLDLAB vector is in `public/brand/GYLDLAB.svg`.
- `public/brand/hero-physical-v1/` — live browser GLB and realtime scene configuration.
- `public/brand/stone-materials/` — optimized browser PBR stone textures; only the selected material is loaded.
- `scripts/package-standalone.mjs` — packages complete production runtime assets.

See [ASSET_CREDITS.md](ASSET_CREDITS.md) for third-party material sources and licensing. Historical scene experiments, editable Blender originals, comparison screenshots, and large test receipts remain in the author's separate local design archive rather than inflating the production website repository.

## Related projects

- [KELD — framework](https://github.com/gyldlab/keld)
- [KELD Benches — measurement and benchmarks](https://github.com/gyldlab/keld-benches)
- [KELD Patched Apps — compatibility experiments](https://github.com/gyldlab/keld-patched-apps)
- [GYLDLAB — engineering and design](https://gyldlab.com)

## Status and rights

The site can be built and evaluated now; its public deployment, browser/device qualification, and the release readiness of the underlying KELD framework are separate gates. This repository does not add a new open-source license for GYLDLAB/KELD artwork or proprietary site content. Third-party materials retain their documented licenses.
