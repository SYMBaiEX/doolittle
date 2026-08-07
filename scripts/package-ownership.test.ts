import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SKIPPED_DIRECTORIES = new Set(["dist", "node_modules", "release"]);

function workspacePackageDirectories(directory: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "package.json") {
      results.push(relative(ROOT, directory));
      continue;
    }
    if (!entry.isDirectory() || SKIPPED_DIRECTORIES.has(entry.name)) {
      continue;
    }
    results.push(...workspacePackageDirectories(join(directory, entry.name)));
  }
  return results;
}

describe("package ownership documentation", () => {
  it("classifies every source workspace package exactly once", async () => {
    const expected = [
      ...workspacePackageDirectories(join(ROOT, "apps")),
      ...workspacePackageDirectories(join(ROOT, "packages")),
    ].sort();
    const document = await readFile(
      join(ROOT, "docs", "package-ownership.md"),
      "utf8",
    );
    const documented = [...document.matchAll(/^\| `([^`]+)` \|/gmu)]
      .map((match) => match[1])
      .sort();

    expect(documented).toEqual(expected);
  });
});
