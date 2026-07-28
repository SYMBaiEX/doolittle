import { describe, expect, it } from "vitest";
import {
  allWorkspaceDirectories,
  visibleWorkspaceTree,
  type WorkspaceTreeEntry,
  workspaceDirectoryAncestors,
} from "./workspace-file-tree";

const entries: WorkspaceTreeEntry[] = [
  { path: "src/components/Button.tsx", type: "file", depth: 2 },
  { path: "README.md", type: "file", depth: 0 },
  { path: "src", type: "directory", depth: 0 },
  { path: "src/index.ts", type: "file", depth: 1 },
  { path: "src/components", type: "directory", depth: 1 },
];

describe("visibleWorkspaceTree", () => {
  it("keeps every directory closed by default", () => {
    expect(
      visibleWorkspaceTree(entries, new Set()).map((entry) => entry.path),
    ).toEqual(["src", "README.md"]);
  });

  it("reveals only children of expanded directories", () => {
    expect(
      visibleWorkspaceTree(entries, new Set(["src"])).map(
        (entry) => entry.path,
      ),
    ).toEqual(["src", "src/components", "src/index.ts", "README.md"]);
    expect(
      visibleWorkspaceTree(entries, new Set(["src", "src/components"])).map(
        (entry) => entry.path,
      ),
    ).toContain("src/components/Button.tsx");
  });

  it("synthesizes missing ancestor directories", () => {
    expect(
      allWorkspaceDirectories([
        { path: "packages/app/index.ts", type: "file", depth: 2 },
      ]),
    ).toEqual(["packages", "packages/app"]);
    expect(workspaceDirectoryAncestors("packages/app/index.ts")).toEqual([
      "packages",
      "packages/app",
    ]);
  });
});
