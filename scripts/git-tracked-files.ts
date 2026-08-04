import { spawnSync } from "node:child_process";

export function listGitTrackedFiles(cwd = process.cwd()): string[] {
  const result = spawnSync("git", ["ls-files"], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`git ls-files failed.\n${detail}`.trim());
  }
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
