import type { GenerateTextParams } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { resolveModelPromptText } from "./index";

describe("resolveModelPromptText", () => {
  it("preserves a supplied legacy prompt exactly", () => {
    expect(
      resolveModelPromptText({
        prompt: "  legacy prompt  ",
      } as GenerateTextParams),
    ).toBe("  legacy prompt  ");
  });

  it("joins current SDK prompt segments in order", () => {
    expect(
      resolveModelPromptText({
        promptSegments: [
          { content: "stable ", stable: true },
          { content: "dynamic", stable: false },
        ],
      } as GenerateTextParams),
    ).toBe("stable dynamic");
  });

  it("uses the canonical Eliza renderer for chat-native messages", () => {
    expect(
      resolveModelPromptText({
        prompt: "",
        messages: [
          { role: "system", content: "Be concrete." },
          {
            role: "user",
            content: [
              { type: "text", text: "Review this repository." },
              {
                type: "file",
                data: "ZmlsZQ==",
                mediaType: "text/plain",
                filename: "README.md",
              },
            ],
          },
        ],
      } as GenerateTextParams),
    ).toBe(
      "system:\nBe concrete.\n\nuser:\nReview this repository.\n[file attachment: README.md]",
    );
  });

  it("preserves native tool calls when a chat must be down-converted", () => {
    expect(
      resolveModelPromptText({
        messages: [
          {
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "call-1",
                name: "READ_FILE",
                arguments: { path: "README.md" },
              },
            ],
          },
        ],
      } as GenerateTextParams),
    ).toContain('Tool calls: [{"id":"call-1","name":"READ_FILE"');
  });

  it("makes a required single tool parseable over a text-only transport", () => {
    const prompt = resolveModelPromptText({
      messages: [{ role: "user", content: "Say hello." }],
      tools: [
        {
          name: "HANDLE_RESPONSE",
          description: "Return the response decision.",
          parameters: {
            type: "object",
            properties: { replyText: { type: "string" } },
            required: ["replyText"],
          },
        },
      ],
      toolChoice: "required",
    } as GenerateTextParams);

    expect(prompt).toContain("user:\nSay hello.");
    expect(prompt).toContain("A tool response is required.");
    expect(prompt).toContain(
      "Return only the JSON arguments for HANDLE_RESPONSE",
    );
    expect(prompt).toContain('"required":["replyText"]');
  });
});
