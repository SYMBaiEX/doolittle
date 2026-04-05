import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "@/runtime/chat";
import { readInformationalResponseCache } from "./chat-turn/cache";
import { runPostProviderTurn } from "./chat-turn/post-provider";

function createContext(observedActionCount = 0) {
  const storedMessages: string[] = [];
  const finishEvents: Array<{
    sessionId: string;
    status: string;
    message?: string;
  }> = [];

  const context = {
    runtime: {},
    services: {
      runController: {
        getActive: () => ({
          observedActionCount,
        }),
        finishTurn: (sessionId: string, status: string, message?: string) => {
          finishEvents.push({ sessionId, status, message });
        },
      },
      sessions: {
        countBySessionRole: () => 1,
        storeMessage: (message: { text: string }) => {
          storedMessages.push(message.text);
        },
      },
    },
    config: {},
  } as unknown as AgentExecutionContext;

  return {
    context,
    finishEvents,
    storedMessages,
  };
}

function createTurn(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "session-1",
    roomId: "room-1",
    entityId: "user-1",
    localInteractive: true,
    ...overrides,
  } as unknown as Parameters<typeof runPostProviderTurn>[0]["turn"];
}

describe("chat turn post-provider seam", () => {
  it("returns the approval response without double-finalizing the turn", async () => {
    const harness = createContext();

    const result = await runPostProviderTurn({
      input: {
        userId: "alice",
        message: "fix the repo",
        source: "cli",
      },
      effectiveInput: {
        userId: "alice",
        message: "fix the repo",
        source: "cli",
      },
      context: harness.context,
      turn: createTurn(),
      response: "",
      runFailureMessage: "planning stalled",
      settingsDuring: {
        model: {
          provider: "openai",
          model: "gpt-4.1",
          baseUrl: "https://api.example.com/v1",
          temperature: 0.2,
          maxTokens: 2048,
        },
      } as Parameters<typeof runPostProviderTurn>[0]["settingsDuring"],
      scheduleProfileObservation: () => undefined,
      loadDirectLocalIntent: async () => ({
        directLocalIntent: {
          label: "workspace:fix",
        },
        executeDirectLocalIntent: async () => {
          throw new Error("should not execute");
        },
        isHighConfidenceDirectLocalIntent: () => true,
        requiresModelSynthesisForLocalIntent: () => false,
        shouldUseDirectLocalFallback: () => true,
      }),
      approveDirectLocalIntent: async () => "approval required",
    });

    expect(result).toEqual({
      kind: "approval",
      response: "approval required",
    });
    expect(harness.storedMessages).toEqual([]);
    expect(harness.finishEvents).toEqual([]);
  });

  it("finalizes fallback execution, writes cache, and completes the turn", async () => {
    const harness = createContext();
    const cacheKey = "post-provider-cache-finalization";

    const result = await runPostProviderTurn({
      input: {
        userId: "alice",
        message: "fix the repo",
        source: "cli",
      },
      effectiveInput: {
        userId: "alice",
        message: "fix the repo",
        source: "cli",
      },
      context: harness.context,
      turn: createTurn(),
      response: "",
      runFailureMessage: "planning stalled",
      settingsDuring: {
        model: {
          provider: "openai",
          model: "gpt-4.1",
          baseUrl: "https://api.example.com/v1",
          temperature: 0.2,
          maxTokens: 2048,
        },
      } as Parameters<typeof runPostProviderTurn>[0]["settingsDuring"],
      responseCacheKey: cacheKey,
      scheduleProfileObservation: () => undefined,
      loadDirectLocalIntent: async () => ({
        directLocalIntent: {
          label: "workspace:fix",
        },
        executeDirectLocalIntent: async () => "fixed locally",
        isHighConfidenceDirectLocalIntent: () => true,
        requiresModelSynthesisForLocalIntent: () => false,
        shouldUseDirectLocalFallback: () => true,
      }),
      approveDirectLocalIntent: async () => undefined,
    });

    expect(result).toEqual({
      kind: "final",
      response: "fixed locally",
      runFailureMessage: undefined,
      observedActionCount: 0,
      usedFallback: true,
    });
    expect(readInformationalResponseCache(cacheKey)).toBe("fixed locally");
    expect(harness.storedMessages).toEqual(["fixed locally"]);
    expect(harness.finishEvents).toEqual([
      {
        sessionId: "session-1",
        status: "complete",
        message: undefined,
      },
    ]);
  });
});
