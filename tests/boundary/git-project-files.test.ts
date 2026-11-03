import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import {
  listGitProjectFiles,
  listGitTrackedFiles,
} from "../../scripts/git-tracked-files";

it("preserves unusual tracked paths and includes only non-ignored new files in project checks", () => {
  const root = mkdtempSync(join(tmpdir(), "doolittle-git-files-"));
  try {
    execFileSync("git", ["init", "-q", root]);
    writeFileSync(join(root, ".gitignore"), "ignored.md\n");
    writeFileSync(join(root, " résumé\nnotes.md"), "tracked");
    execFileSync("git", ["add", ".gitignore", " résumé\nnotes.md"], {
      cwd: root,
    });
    writeFileSync(join(root, "new file.md"), "new");
    writeFileSync(join(root, "ignored.md"), "ignored");

    expect(listGitTrackedFiles(root).sort()).toEqual([
      " résumé\nnotes.md",
      ".gitignore",
    ]);
    expect(listGitProjectFiles(root).sort()).toEqual([
      " résumé\nnotes.md",
      ".gitignore",
      "new file.md",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("checks links in a new, untracked Markdown document", () => {
  const root = mkdtempSync(join(tmpdir(), "doolittle-link-check-"));
  try {
    execFileSync("git", ["init", "-q", root]);
    writeFileSync(join(root, "new.md"), "[guide](missing.md)\n");
    const script = resolve("scripts/check-local-links.ts");
    const broken = spawnSync("nub", [script], { cwd: root, encoding: "utf8" });
    expect(broken.status).toBe(1);
    expect(broken.stderr).toContain("new.md:1 -> missing.md");
    writeFileSync(join(root, "missing.md"), "Guide\n");
    const fixed = spawnSync("nub", [script], { cwd: root, encoding: "utf8" });
    expect(fixed.status).toBe(0);
    expect(fixed.stdout).toContain("Local documentation link check passed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
