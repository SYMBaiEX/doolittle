import { describe, expect, it } from "vitest";
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
    expect(resolveContextWindow("gpt-5.6-sol")).toBe(1_050_000);
    expect(resolveContextWindow("claude-fable-5")).toBe(1_000_000);
    expect(resolveContextWindow("claude-haiku-4-5")).toBe(200_000);
    expect(resolveContextWindow("unknown-model")).toBe(128_000);
  });

  it("measures usage against the configured threshold", () => {
    const service = new ContextCompressionService({
      contextWindowTokens: 10_000,
      threshold: 0.9,
    });
    const messages = [
      makeMessage("1", "short"),
      makeMessage("2", "reply", "assistant"),
    ];

    const stats = service.measure(messages);
    expect(stats.overThreshold).toBe(false);
    expect(stats.contextWindowTokens).toBe(10_000);
    expect(service.isApproachingLimit(messages, 0)).toBe(true);
  });
});
