import { describe, expect, it } from "vitest";
import { codingWorkspaceResourceDependencies } from "./CodingWorkspacePage";
import { apiResourceCacheKey } from "./lib";

describe("coding workspace resource cache identity", () => {
  it("separates every workspace-bound resource when the runtime workspace changes", () => {
    const path = "/workspace/tree?depth=12";
    const workspaceA = codingWorkspaceResourceDependencies(
      true,
      "/work/project-a",
    );
    const workspaceB = codingWorkspaceResourceDependencies(
      true,
      "/work/project-b",
    );

    expect(apiResourceCacheKey(path, workspaceA)).not.toBe(
      apiResourceCacheKey(path, workspaceB),
    );
  });

  it("keeps same-relative-path file resources isolated across workspaces", () => {
    const path = "/workspace/read?path=src/index.ts";
    const workspaceA = codingWorkspaceResourceDependencies(
      true,
      "/work/project-a",
      "src/index.ts",
    );
    const workspaceB = codingWorkspaceResourceDependencies(
      true,
      "/work/project-b",
      "src/index.ts",
    );

    expect(apiResourceCacheKey(path, workspaceA)).not.toBe(
      apiResourceCacheKey(path, workspaceB),
    );
  });
});
