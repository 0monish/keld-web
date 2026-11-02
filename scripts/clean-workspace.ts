/**
 * Windows (and fallback) workspace cleaner.
 * Mac/Linux should hit `bun exec 'rm -rf .next node_modules'` via package.json `clean`
 * and only reach this file when that path is unavailable (e.g. Windows).
 *
 * Platform detection: Bun has no `Bun.platform`. Use `navigator.platform`
 * ("MacIntel" | "Win32" | "Linux x86_64") — see bun-types Navigator.
 */
const targets = [".next", "node_modules"];
const isWindows = navigator.platform === "Win32";

function cleanWindows(): void {
  for (const target of targets) {
    const result = Bun.spawnSync({
      cmd: ["cmd", "/d", "/s", "/c", `if exist "${target}" rmdir /s /q "${target}"`],
      stdout: "inherit",
      stderr: "inherit",
    });
    if (result.exitCode !== 0) {
      throw new Error(`Failed to remove ${target} (exit ${result.exitCode})`);
    }
  }
}

function cleanUnixFallback(): void {
  const result = Bun.spawnSync({
    cmd: ["rm", "-rf", ...targets],
    stdout: "inherit",
    stderr: "inherit",
  });
  if (result.exitCode !== 0) {
    throw new Error(`Failed to clean workspace (exit ${result.exitCode})`);
  }
}

if (isWindows) {
  cleanWindows();
} else {
  cleanUnixFallback();
}

console.log("✅ Workspace cleanup complete");
