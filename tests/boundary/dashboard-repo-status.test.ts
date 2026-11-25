// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { summarizeRepoStatus } from "../../apps/desktop/src/renderer/dashboard-helpers";

describe("summarizeRepoStatus", () => {
  it("labels non-git workspaces with the workspace folder name", () => {
    const snapshot = summarizeRepoStatus(
      "(workspace is not inside a git repository)",
      "/Users/dev/doolittle",
    );
    expect(snapshot.branch).toBe("doolittle");
    expect(snapshot.upstream).toBeUndefined();
    expect(snapshot.dirty).toBe(false);
    expect(snapshot.lines).toEqual([]);
  });

  it("uses a generic workspace label when no folder name is available", () => {
    expect(summarizeRepoStatus(undefined).branch).toBe("Local workspace");
    expect(summarizeRepoStatus("", "").branch).toBe("Local workspace");
    expect(summarizeRepoStatus("garbage", "/").branch).toBe("Local workspace");
  });

  it("keeps the parsed branch for git workspaces", () => {
    const snapshot = summarizeRepoStatus(
      "## main...origin/main [ahead 1, behind 2]\n M file.ts",
      "/Users/dev/doolittle",
    );
    expect(snapshot.branch).toBe("main");
    expect(snapshot.upstream).toBe("origin/main");
    expect(snapshot.ahead).toBe(1);
    expect(snapshot.behind).toBe(2);
    expect(snapshot.dirty).toBe(true);
    expect(snapshot.changedFiles).toBe(1);
  });
});
