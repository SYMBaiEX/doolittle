import { describe, expect, it } from "bun:test";
import { renderTopLevelHelp, resolveEntrypointRepoRoot } from "./help";

describe("renderTopLevelHelp", () => {
  it("groups the primary entrypoint surfaces into operator flows", () => {
    expect(renderTopLevelHelp()).toContain("doolittle exec -p");
    expect(renderTopLevelHelp()).toContain("doolittle jobs list");
    expect(renderTopLevelHelp()).toContain("doolittle cockpit");
    expect(renderTopLevelHelp()).toContain("doolittle status");
    expect(renderTopLevelHelp()).toContain("doolittle progress");
    expect(renderTopLevelHelp()).toContain("doolittle tools");
    expect(renderTopLevelHelp()).toContain("doolittle skills");
    expect(renderTopLevelHelp()).toContain("Daily shell:");
    expect(renderTopLevelHelp()).toContain("One-shot operator views:");
  });
});

describe("resolveEntrypointRepoRoot", () => {
  it("walks from the executable entrypoint to the repo root", () => {
    expect(
      resolveEntrypointRepoRoot(
        "file:///Users/test/project/packages/agent/src/index.ts",
      ),
    ).toBe("/Users/test/project/");
  });
});
