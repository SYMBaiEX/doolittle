import { describe, expect, it } from "bun:test";
import type { GenerateTextParams } from "@elizaos/core";
import { resolveModelPromptText } from "./prompt-text";

describe("resolveModelPromptText", () => {
  it("prefers a non-empty legacy prompt", () => {
    expect(
      resolveModelPromptText({ prompt: "hello" } as GenerateTextParams),
    ).toBe("hello");
  });

  it("falls back to string message content when prompt is absent", () => {
    const params = {
      messages: [{ role: "user", content: "from messages" }],
    } as GenerateTextParams;
    expect(resolveModelPromptText(params)).toBe("from messages");
  });

  it("concatenates text content parts and ignores non-text parts", () => {
    const params = {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "a" },
            { type: "image", image: "data:image/png;base64,xx" },
            { type: "text", text: "b" },
          ],
        },
      ],
    } as unknown as GenerateTextParams;
    expect(resolveModelPromptText(params)).toBe("ab");
  });

  it("joins multiple messages with newlines and skips blank entries", () => {
    const params = {
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "   " },
        { role: "user", content: "usr" },
      ],
    } as GenerateTextParams;
    expect(resolveModelPromptText(params)).toBe("sys\nusr");
  });

  it("returns an empty string when neither prompt nor messages are present", () => {
    expect(resolveModelPromptText({} as GenerateTextParams)).toBe("");
  });
});
