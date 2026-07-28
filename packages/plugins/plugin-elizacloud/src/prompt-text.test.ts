import type { GenerateTextParams } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { resolveModelPromptText } from "./prompt-text";

describe("resolveModelPromptText", () => {
  it("prefers a non-empty legacy prompt", () => {
    expect(
      resolveModelPromptText({ prompt: "hello" } as GenerateTextParams),
    ).toBe("hello");
  });

  it("preserves whitespace in a valid alpha prompt", () => {
    expect(
      resolveModelPromptText({ prompt: "  keep this  " } as GenerateTextParams),
    ).toBe("  keep this  ");
  });
});
