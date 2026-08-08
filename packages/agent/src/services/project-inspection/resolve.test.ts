import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveLocalProjectTarget } from "./resolve";

const createdPaths: string[] = [];

function createHome(): string {
  const parent = join(
    tmpdir(),
    `doolittle-project-resolution-${process.pid}-${Date.now()}-${createdPaths.length}`,
  );
  const home = join(parent, "developer");
  mkdirSync(home, { recursive: true });
  createdPaths.push(parent);
  return home;
}

afterEach(() => {
  while (createdPaths.length > 0) {
    const createdPath = createdPaths.pop();
    if (createdPath) {
      rmSync(createdPath, { recursive: true, force: true });
    }
  }
});

describe("resolveLocalProjectTarget", () => {
  it("resolves account-relative home paths and classifies directories", () => {
    const home = createHome();
    const dev = join(home, "dev");
    mkdirSync(dev);
    const previousHome = process.env.HOME;
    process.env.HOME = home;

    try {
      expect(resolveLocalProjectTarget("developer/dev", "/workspace")).toEqual({
        path: dev,
        kind: "directory",
      });
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
    }
  });

  it("resolves workspace-relative files and rejects missing paths", () => {
    const workspace = createHome();
    const filePath = join(workspace, "src", "index.ts");
    mkdirSync(join(workspace, "src"));
    writeFileSync(filePath, "export {};\n");

    expect(resolveLocalProjectTarget("src/index.ts", workspace)).toEqual({
      path: filePath,
      kind: "file",
    });
    expect(resolveLocalProjectTarget("src/missing.ts", workspace)).toBe(
      undefined,
    );
  });
});
