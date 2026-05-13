import { describe, expect, it } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  extractExplicitProjectPath,
  resolveLocalProjectPath,
  resolveWorkspaceIntentFromParams,
  resolveWorkspaceIntentFromText,
} from "./workspace-action";

describe("resolveWorkspaceIntentFromText", () => {
  it("routes repo breakdown prompts to the deterministic overview path", () => {
    expect(
      resolveWorkspaceIntentFromText("Give me a breakdown of this repo"),
    ).toEqual({ kind: "overview" });
    expect(resolveWorkspaceIntentFromText("Review this codebase")).toEqual({
      kind: "overview",
    });
    expect(resolveWorkspaceIntentFromText("Map out this repository")).toEqual({
      kind: "overview",
    });
    expect(
      resolveWorkspaceIntentFromText(
        "Research that repo now and give me a breakdown",
      ),
    ).toEqual({
      kind: "overview",
    });
  });

  it("does not misread account-relative development paths as absolute /dev", () => {
    const message =
      "Can you make a new directory in the symbiex/dev named the-effect and make a html file with css and js";

    expect(extractExplicitProjectPath(message)).toBe("symbiex/dev");
    expect(resolveWorkspaceIntentFromText(message)).toBeUndefined();
  });

  it("still routes explicit inspection requests for account-relative development paths", () => {
    expect(
      resolveWorkspaceIntentFromText(
        "inspect the symbiex/dev directory locally",
      ),
    ).toEqual({ kind: "find-codebase", query: "symbiex/dev" });
  });
});

describe("resolveLocalProjectPath", () => {
  it("resolves account-relative home paths like symbiex/dev", () => {
    const parent = join(tmpdir(), `doolittle-home-${Date.now()}`);
    const home = join(parent, "symbiex");
    const dev = join(home, "dev");
    mkdirSync(dev, { recursive: true });

    const previousHome = process.env.HOME;
    process.env.HOME = home;
    try {
      expect(resolveLocalProjectPath("symbiex/dev", "/workspace")).toBe(dev);
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
      rmSync(parent, { recursive: true, force: true });
    }
  });
});

describe("resolveWorkspaceIntentFromParams", () => {
  it("parses write intents from action parameters", () => {
    expect(
      resolveWorkspaceIntentFromParams({
        action: "write",
        file: "packages/agent/src/foo.ts",
        text: "export const ok = true;",
      }),
    ).toEqual({
      kind: "write",
      path: "packages/agent/src/foo.ts",
      content: "export const ok = true;",
    });
  });
});
