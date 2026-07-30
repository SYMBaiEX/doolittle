import { type GenerateTextParams, ModelType } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import {
  createElizaTextGenerationModelHandlers,
  createProviderHttpError,
  ELIZA_TEXT_GENERATION_MODEL_TYPES,
  isElizaTextGenerationModelType,
  normalizeProviderTransportError,
  ProviderTransportError,
  resolveModelPromptText,
} from "./index";

describe("provider transport failures", () => {
  it("exposes structured HTTP failures for host recovery UX", () => {
    const error = createProviderHttpError({
      provider: "codex",
      operation: "responses request",
      status: 429,
      detail: "slow down",
    });

    expect(error).toBeInstanceOf(ProviderTransportError);
    expect(error).toMatchObject({
      code: "rate_limited",
      provider: "codex",
      operation: "responses request",
      retryable: true,
      status: 429,
      detail: "slow down",
    });
  });

  it("normalizes abort and timeout failures without parsing prose", () => {
    expect(
      normalizeProviderTransportError(
        "claude-code",
        "messages request",
        new DOMException("stopped", "AbortError"),
      ),
    ).toMatchObject({ code: "cancelled", retryable: false });

    const timeout = new Error("deadline");
    timeout.name = "TimeoutError";
    expect(
      normalizeProviderTransportError("codex", "responses request", timeout),
    ).toMatchObject({ code: "timeout", retryable: true });
  });
});

describe("Eliza text model registrations", () => {
  it("keeps routing and provider registrations on one SDK model surface", async () => {
    const calls: string[] = [];
    const handlers = createElizaTextGenerationModelHandlers(
      async (_runtime, _params, modelType) => {
        calls.push(modelType);
        return modelType;
      },
    );

    expect(Object.keys(handlers)).toEqual([
      ...ELIZA_TEXT_GENERATION_MODEL_TYPES,
    ]);
    expect(isElizaTextGenerationModelType(ModelType.RESPONSE_HANDLER)).toBe(
      true,
    );
    expect(isElizaTextGenerationModelType(ModelType.TEXT_EMBEDDING)).toBe(
      false,
    );
    expect(isElizaTextGenerationModelType(ModelType.RESEARCH)).toBe(false);
    await handlers[ModelType.TEXT_REASONING_LARGE]({} as never, {
      prompt: "reason",
    });
    expect(calls).toEqual([ModelType.TEXT_REASONING_LARGE]);
  });
});

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
