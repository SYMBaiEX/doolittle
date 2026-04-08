import { describe, expect, it } from "bun:test";
import type { StoredMessage } from "@/types";
import {
  ContextCompressionService,
  estimateMessagesTokens,
  estimateTokens,
  resolveContextWindow,
} from "./index";

function makeMessage(
  id: string,
  text: string,
  role: StoredMessage["role"] = "user",
): StoredMessage {
  return {
    id,
    sessionId: "session-1",
    roomId: "room-1",
    entityId: role === "assistant" ? "assistant" : "user",
    role,
    text,
    createdAt: "2026-04-01T00:00:00.000Z",
  };
}

describe("context-compression", () => {
  it("estimates token counts and resolves known model windows", () => {
    expect(estimateTokens("12345678")).toBe(2);
    expect(
      estimateMessagesTokens([makeMessage("1", "hello world")]),
    ).toBeGreaterThan(0);
    expect(resolveContextWindow("gpt-5.4")).toBe(1_050_000);
    expect(resolveContextWindow("unknown-model")).toBe(128_000);
  });

  it("measures usage and avoids compression below the threshold", () => {
    const service = new ContextCompressionService({
      contextWindowTokens: 10_000,
      threshold: 0.9,
    });
    const messages = [
      makeMessage("1", "short"),
      makeMessage("2", "reply", "assistant"),
    ];

    expect(service.measure(messages).overThreshold).toBe(false);
    expect(service.analyze(messages).compressed).toBe(false);
  });

  it("compresses middle turns and applies the summary placeholder", () => {
    const service = new ContextCompressionService({
      contextWindowTokens: 50,
      threshold: 0.5,
      preserveLeadingTurns: 1,
      preserveRecentTurns: 1,
    });
    const messages = [
      makeMessage("1", "alpha alpha alpha alpha"),
      makeMessage("2", "beta beta beta beta"),
      makeMessage("3", "gamma gamma gamma gamma", "assistant"),
      makeMessage("4", "delta delta delta delta"),
    ];

    const result = service.analyze(messages);
    expect(result.compressed).toBe(true);
    expect(result.middleTurns).toHaveLength(2);
    expect(result.summaryPrompt).toContain("CONVERSATION EXCERPT TO SUMMARIZE");

    const compressed = service.applyCompression(
      messages,
      "Summarized middle turns",
      "session-1",
    );
    expect(compressed).toHaveLength(3);
    expect(compressed[1]?.text).toContain("Summarized middle turns");
  });
});
