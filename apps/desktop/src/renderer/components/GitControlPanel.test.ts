import { readFileSync } from "node:fs";
import type {
  RepositoryBranch,
  RepositoryStash,
} from "@doolittle/contracts/repository";
import { describe, expect, it } from "vitest";
import { GitControlPanel } from "./GitControlPanel";

const gitControlPrimitives = readFileSync(
  new URL("./git/GitControlPrimitives.tsx", import.meta.url),
  "utf8",
);
const gitControlSource = readFileSync(
  new URL("./GitControlPanel.tsx", import.meta.url),
  "utf8",
);

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

describe("GitControlPanel keyboard focus contract", () => {
  it("keeps compact controls visibly focusable without styling unfocused fields", () => {
    expect(gitControlPrimitives).toContain("focus-visible:outline-2");
    expect(gitControlPrimitives).toContain("focus-visible:outline-offset-2");
    expect(gitControlPrimitives).not.toContain("focus:outline-");
  });
});

describe("GitControlPanel density", () => {
  it("keeps everyday change and commit controls outside advanced operations", () => {
    const advancedIndex = gitControlSource.indexOf(
      'data-git-advanced-disclosure=""',
    );

    expect(advancedIndex).toBeGreaterThan(0);
    expect(gitControlSource.indexOf("data-git-change-section")).toBeLessThan(
      advancedIndex,
    );
    expect(gitControlSource.indexOf("data-git-commit-form")).toBeLessThan(
      advancedIndex,
    );
    expect(gitControlSource).not.toContain(
      'data-git-advanced-disclosure="" open',
    );
  });
});
