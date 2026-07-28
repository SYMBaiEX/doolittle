import { describe, expect, it } from "vitest";
import {
  normalizeWorkspacePathForComparison,
  workspacePathsEqual,
} from "./workspace-path";

describe("workspace path comparison", () => {
  it("treats macOS private filesystem aliases as the same workspace", () => {
    expect(
      workspacePathsEqual(
        "/var/folders/example/repo",
        "/private/var/folders/example/repo",
        "darwin",
      ),
    ).toBe(true);
    expect(
      workspacePathsEqual("/tmp/repo", "/private/tmp/repo", "darwin"),
    ).toBe(true);
  });

  it("normalizes Windows separators, case, and trailing slashes", () => {
    expect(
      workspacePathsEqual(
        "C:\\Users\\Example\\Repo\\",
        "c:/users/example/repo",
        "win32",
      ),
    ).toBe(true);
  });

  it("does not collapse distinct repository paths", () => {
    expect(
      normalizeWorkspacePathForComparison("/Users/example/repo-a", "darwin"),
    ).not.toBe(
      normalizeWorkspacePathForComparison("/Users/example/repo-b", "darwin"),
    );
  });
});
