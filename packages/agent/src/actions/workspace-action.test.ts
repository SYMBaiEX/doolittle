import { describe, expect, it } from "bun:test";
import { resolveWorkspaceIntentFromText } from "./workspace-action";

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
  });
});
