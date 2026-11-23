import { lstatSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

export const CODEX_ACP_PACKAGE = "@agentclientprotocol/codex-acp";

/** Resolve the chained published entry points without evaluating them. */
export function codexRuntimeFiles(require: NodeJS.Require) {
  const adapter = require.resolve(CODEX_ACP_PACKAGE);
  const launcher = createRequire(adapter).resolve("@openai/codex/bin/codex.js");
  const platformPackage = `@openai/codex-${process.platform}-${process.arch}`;
  const platformManifest = createRequire(launcher).resolve(
    `${platformPackage}/package.json`,
  );
  const vendor = resolve(dirname(platformManifest), "vendor");
  const targets = readdirSync(vendor, { withFileTypes: true }).filter((entry) =>
    entry.isDirectory(),
  );
  if (targets.length !== 1)
    throw new Error(`Expected one native Codex target in ${platformPackage}`);
  const platformRoot = resolve(vendor, targets[0].name);
  const binaryDirectory = resolve(platformRoot, "bin");
  const executable = resolve(
    binaryDirectory,
    process.platform === "win32" ? "codex.exe" : "codex",
  );
  const nativeFile = lstatSync(executable);
  if (
    !nativeFile.isFile() ||
    (process.platform !== "win32" && (nativeFile.mode & 0o111) === 0)
  ) {
    throw new Error(`Missing usable native Codex executable: ${executable}`);
  }
  return {
    adapter,
    launcher,
    executable,
    binaryDirectory,
    searchDirectory: resolve(platformRoot, "codex-path"),
  };
}
