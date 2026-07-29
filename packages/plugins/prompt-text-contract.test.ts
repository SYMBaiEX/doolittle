import type { GenerateTextParams } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { resolveModelPromptText as resolveDoolittlePrompt } from "./doolittle-plugin/prompt-text";
import { resolveModelPromptText as resolveClaudePrompt } from "./plugin-claude-code/src/prompt-text";
import { resolveModelPromptText as resolveCodexPrompt } from "./plugin-codex/src/prompt-text";
import { resolveModelPromptText as resolveDevinPrompt } from "./plugin-devin/src/prompt-text";
import { resolveModelPromptText as resolveElizaCloudPrompt } from "./plugin-elizacloud/src/prompt-text";

const resolvers = [
  ["Doolittle fallback", resolveDoolittlePrompt],
  ["Claude", resolveClaudePrompt],
  ["Codex", resolveCodexPrompt],
  ["Devin", resolveDevinPrompt],
  ["Eliza Cloud", resolveElizaCloudPrompt],
] as const;

describe.each(resolvers)("%s prompt contract", (_provider, resolvePrompt) => {
  it("preserves a supplied legacy prompt exactly", () => {
    expect(
      resolvePrompt({ prompt: "  legacy prompt  " } as GenerateTextParams),
    ).toBe("  legacy prompt  ");
  });

  it("joins current SDK prompt segments in order", () => {
    expect(
      resolvePrompt({
        promptSegments: [
          { content: "stable ", stable: true },
          { content: "dynamic", stable: false },
        ],
      } as GenerateTextParams),
    ).toBe("stable dynamic");
  });

  it("does not let an empty legacy field erase current SDK messages", () => {
    expect(
      resolvePrompt({
        prompt: "",
        messages: [{ role: "user", content: "Keep this request." }],
      } as GenerateTextParams),
    ).toBe("USER:\nKeep this request.");
  });

  it("serializes chat-native messages when segments are unavailable", () => {
    expect(
      resolvePrompt({
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
      "SYSTEM:\nBe concrete.\n\nUSER:\nReview this repository.\n[file attachment: README.md]",
    );
  });

  it("makes a required single tool parseable over a text-only transport", () => {
    const prompt = resolvePrompt({
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

    expect(prompt).toContain("USER:\nSay hello.");
    expect(prompt).toContain("A tool response is required.");
    expect(prompt).toContain(
      "Return only the JSON arguments for HANDLE_RESPONSE",
    );
    expect(prompt).toContain('"required":["replyText"]');
  });
});
