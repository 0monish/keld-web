import { cp, lstat, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Next's standalone server intentionally excludes public and .next/static.
// https://nextjs.org/docs/app/api-reference/config/next-config-js/output
const project = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(project, ".next", "standalone");

async function verifyRegularFiles(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Asset symlink is not allowed: ${file}`);
    if (entry.name.startsWith(".env") || /\.(pem|key|p12|pfx)$/i.test(entry.name)) {
      throw new Error(`Sensitive-looking file must not enter the release: ${file}`);
    }
    if (entry.isDirectory()) await verifyRegularFiles(file);
    else if (!entry.isFile()) throw new Error(`Unsupported asset type: ${file}`);
  }
}

try {
  const server = path.join(output, "server.js");
  if (!(await lstat(server)).isFile()) throw new Error("Build the standalone server first.");
  const actualOutput = await realpath(output);
  if (!actualOutput.startsWith(`${await realpath(project)}${path.sep}`)) {
    throw new Error("Refusing to package outside this project.");
  }
  for (const relative of ["public", path.join(".next", "static")]) {
    const source = path.join(project, relative);
    await verifyRegularFiles(source);
    await cp(source, path.join(output, relative), { recursive: true, force: true });
  }
  const pkg = JSON.parse(await readFile(path.join(project, "package.json"), "utf8"));
  const buildId = (await readFile(path.join(project, ".next", "BUILD_ID"), "utf8")).trim();
  const manifest = {
    application: pkg.name,
    buildId,
    next: pkg.dependencies.next,
    three: pkg.dependencies.three,
    builtWith: { node: process.version, platform: process.platform, architecture: process.arch },
    publicAssetsIncluded: true,
    browserChunksIncluded: true,
    sourceRepositoryIntegration: "gyldlab/keld-web",
    publicDeployment: false,
  };
  await writeFile(path.join(output, "release-info.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ output, ...manifest }, null, 2));
} catch (error) {
  console.error("Standalone packaging failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
