import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectKeyFolders,
  collectNotableFiles,
  listTopEntries,
} from "./layout";

const createdPaths: string[] = [];

function createProject(): string {
  const projectPath = join(
    tmpdir(),
    `doolittle-project-layout-${process.pid}-${Date.now()}-${createdPaths.length}`,
  );
  mkdirSync(projectPath, { recursive: true });
  createdPaths.push(projectPath);
  return projectPath;
}

afterEach(() => {
  while (createdPaths.length > 0) {
    const createdPath = createdPaths.pop();
    if (createdPath) {
      rmSync(createdPath, { recursive: true, force: true });
    }
  }
});

describe("project inspection layout", () => {
  it("includes application roots before bounded child details", () => {
    const projectPath = createProject();
    for (const folder of [
      "app",
      "components",
      "convex",
      "desktop",
      "docs",
      "lib",
      "scripts",
    ]) {
      mkdirSync(join(projectPath, folder), { recursive: true });
    }
    mkdirSync(join(projectPath, "app", "api"), { recursive: true });
    mkdirSync(join(projectPath, "components", "chat"), { recursive: true });

    const folders = collectKeyFolders(projectPath);

    expect(folders).toEqual(
      expect.arrayContaining([
        "app",
        "components",
        "convex",
        "desktop",
        "docs",
        "lib",
        "scripts",
        "app/api",
        "components/chat",
      ]),
    );
  });

  it("prioritizes useful visible entries over dotfiles and build caches", () => {
    const projectPath = createProject();
    for (const folder of [
      ".git",
      ".next",
      ".playwright-cli",
      ".config",
      "app",
      "components",
      "convex",
    ]) {
      mkdirSync(join(projectPath, folder), { recursive: true });
    }
    writeFileSync(join(projectPath, "README.md"), "# Demo\n");

    expect(listTopEntries(projectPath, 4)).toEqual([
      "app",
      "components",
      "convex",
      "README.md",
    ]);
  });

  it("returns only verified notable files from architecture roots", () => {
    const projectPath = createProject();
    for (const path of [
      "app/layout.tsx",
      "app/page.tsx",
      "convex/runtime.ts",
      "convex/schema.ts",
      "desktop/main.cjs",
      "desktop/package.json",
      "package.json",
    ]) {
      const target = join(projectPath, path);
      mkdirSync(join(target, ".."), { recursive: true });
      writeFileSync(target, "{}\n");
    }

    const files = collectNotableFiles(projectPath);

    expect(files).toEqual(
      expect.arrayContaining([
        "package.json",
        "app/layout.tsx",
        "app/page.tsx",
        "convex/runtime.ts",
        "convex/schema.ts",
        "desktop/main.cjs",
        "desktop/package.json",
      ]),
    );
    expect(files).not.toContain("app/routes.tsx");
  });
});
