import { describe, expect, it } from "bun:test";
import {
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
