import { describe, expect, it } from "vitest";
import {
  bounded,
  commandOutput,
  contextBlock,
  flattenSettingEntries,
  normalizeChangeEntries,
  normalizeFileEntries,
  workbenchResourcePaths,
} from "./thread-workbench-controller";

describe("thread workbench rail controller helpers", () => {
  it("gates resource paths by the active tab and encodes selected paths", () => {
    expect(
      workbenchResourcePaths(false, "files", "src/a b.ts", ""),
    ).toMatchObject({
      summary: null,
      tree: null,
      file: null,
    });
    expect(workbenchResourcePaths(true, "brief", "", "")).toMatchObject({
      terminal: "/terminal/history",
      plans: "/plans",
      delegationTasks: "/delegation/tasks?limit=8",
      approvals: "/execution/approvals?status=pending",
    });
    expect(workbenchResourcePaths(true, "files", "src/a b.ts", "").file).toBe(
      "/workspace/read?path=src%2Fa%20b.ts",
    );
    expect(workbenchResourcePaths(true, "changes", "", "a&b.ts").patch).toBe(
      "/repo/patch?path=a%26b.ts&staged=false",
    );
    expect(workbenchResourcePaths(true, "changes", "", "")).toMatchObject({
      branches: "/repo/branches",
      remotes: "/repo/remotes",
      stashes: "/repo/stashes",
      conflicts: "/repo/conflicts",
      worktrees: "/repo/worktrees",
      checkpoints: "/workspace/checkpoints",
    });
  });

  it("filters invalid tree rows and bounds valid entry depth", () => {
    expect(
      normalizeFileEntries([
        { path: "src", type: "directory", depth: -2 },
        { path: "src/main.ts", type: "file", depth: 50 },
        { path: "", type: "file" },
        { path: "bad", type: "link" },
      ]),
    ).toEqual([
      { path: "src", type: "directory", depth: 0 },
      { path: "src/main.ts", type: "file", depth: 12 },
    ]);
  });

  it("normalizes git changes and retains the modified fallback", () => {
    expect(
      normalizeChangeEntries([
        {
          path: "staged.ts",
          indexStatus: "M",
          worktreeStatus: " ",
          staged: true,
        },
        { path: "fallback.ts" },
        { indexStatus: "D" },
      ]),
    ).toEqual([
      {
        path: "staged.ts",
        status: "M",
        staged: true,
        unstaged: false,
        untracked: false,
      },
      {
        path: "fallback.ts",
        status: "modified",
        staged: false,
        unstaged: false,
        untracked: false,
      },
    ]);
  });

  it("prefers streamed terminal output before stdout, stderr, and output", () => {
    expect(
      commandOutput({
        streamOutput: "live",
        stdout: "out",
        stderr: "err",
        output: "legacy",
      }),
    ).toBe("live");
    expect(
      commandOutput({ stdout: "out", stderr: "err", output: "legacy" }),
    ).toBe("out\nerr");
    expect(commandOutput({ output: "legacy" })).toBe("legacy");
  });

  it("flattens settings and callers can cap the rendered snapshot", () => {
    const flattened = flattenSettingEntries({
      nested: { enabled: true },
      array: [1, 2],
      none: null,
    });
    expect(flattened).toEqual([
      { key: "nested.enabled", value: "true" },
      { key: "array", value: "[2 items]" },
      { key: "none", value: "null" },
    ]);
    expect(flattenSettingEntries({ a: 1, b: 2 }).slice(0, 1)).toEqual([
      { key: "a", value: "1" },
    ]);
  });

  it("truncates context without losing its wrapper", () => {
    expect(bounded("abcdef", 3)).toBe(
      "abc\n\n[Context truncated by Doolittle]",
    );
    expect(contextBlock("file", "a.ts", "  body  ")).toContain("body");
  });
});
