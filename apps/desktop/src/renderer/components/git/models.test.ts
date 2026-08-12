import { describe, expect, it } from "vitest";
import { shortGitPath } from "./models";

describe("shortGitPath", () => {
  it("keeps short paths and bounds deeply nested worktree labels", () => {
    expect(shortGitPath("src/index.ts")).toBe("src/index.ts");
    expect(shortGitPath("/Users/example/dev/org/repo/src/index.ts")).toBe(
      "…/org/repo/src/index.ts",
    );
  });
});
