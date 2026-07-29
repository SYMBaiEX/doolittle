import type {
  RepositoryBranch,
  RepositoryStash,
} from "@doolittle/contracts/repository";
import { describe, expect, it } from "vitest";
import { GitControlPanel } from "./GitControlPanel";

describe("GitControlPanel input model", () => {
  it("uses the shared repository records required by the panel", () => {
    const branch: RepositoryBranch = {
      name: "main",
      current: true,
      upstream: "origin/main",
    };
    const stash: RepositoryStash = {
      reference: "stash@{0}",
      message: "WIP",
      branch: "main",
    };
    expect(branch.current).toBe(true);
    expect(stash.reference).toBe("stash@{0}");
    expect(typeof GitControlPanel).toBe("function");
  });
});
