import { spawnSync } from "node:child_process";

function listGitFiles(cwd: string, includeUntracked: boolean): string[] {
  const result = spawnSync(
    "git",
    [
      "ls-files",
      "-z",
      ...(includeUntracked
        ? ["--cached", "--others", "--exclude-standard"]
        : []),
    ],
    { cwd, encoding: "utf8" },
  );
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`git ls-files failed.\n${detail}`.trim());
  }
  // Git's default human-readable output quotes unusual paths. NUL-separated
  // output preserves spaces, Unicode and even newlines without decoding rules.
  return result.stdout.split("\0").filter(Boolean);
}

export function listGitTrackedFiles(cwd = process.cwd()): string[] {
  return listGitFiles(cwd, false);
}

/** Include non-ignored new files when checking work in progress. */
export function listGitProjectFiles(cwd = process.cwd()): string[] {
  return listGitFiles(cwd, true);
}
