import { readFileSync } from "node:fs";
import type {
  RepositoryBranch,
  RepositoryStash,
} from "@doolittle/contracts/repository";
import { describe, expect, it } from "vitest";
import { GitControlPanel } from "./GitControlPanel";

const gitControlCss = readFileSync(
  new URL("./git-control-panel.css", import.meta.url),
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
    expect(gitControlCss).toContain(
      ".git-control-panel :is(button, input, textarea):focus-visible",
    );
    expect(gitControlCss).toContain(
      '.git-control-panel input[type="checkbox"]:focus-visible',
    );
    expect(gitControlCss).toContain("outline-offset: 2px;");
    expect(gitControlCss).not.toContain(".git-control-panel input:focus,");
  });
});
