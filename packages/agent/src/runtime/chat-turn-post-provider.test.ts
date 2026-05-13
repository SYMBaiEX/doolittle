import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "@/runtime/chat";
import { runPostProviderTurn } from "./chat-turn/post-provider";

function createContext(
  input: {
    observedActionCount?: number;
    assistantTurnCount?: number;
    recentMessages?: Array<{ text: string }>;
    contextCompression?: {
      isApproachingLimit: () => boolean;
      measure: () => {
        usageFraction: number;
        estimatedTokens: number;
      };
    };
    skillSynthesis?: {
      analyzeConversation: () => {
        shouldSynthesize: boolean;
        candidate?: {
          title: string;
        };
      };
    };
  } = {},
) {
  const storedMessages: string[] = [];
  const finishEvents: Array<{
    sessionId: string;
    status: string;
    message?: string;
  }> = [];
  const observedActionCount = input.observedActionCount ?? 0;

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
        countBySessionRole: () => input.assistantTurnCount ?? 1,
        recentBySession: () => input.recentMessages ?? [],
        storeMessage: (message: { text: string }) => {
          storedMessages.push(message.text);
        },
      },
      contextCompression: input.contextCompression,
      skillSynthesis: input.skillSynthesis,
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

  it("finalizes fallback execution without caching conversational output", async () => {
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
    expect(harness.storedMessages).toEqual(["fixed locally"]);
    expect(harness.finishEvents).toEqual([
      {
        sessionId: "session-1",
        status: "complete",
        message: undefined,
      },
    ]);
  });

  it("does not synthesize canned greetings when the provider fails before acting", async () => {
    const harness = createContext();

    const result = await runPostProviderTurn({
      input: {
        userId: "alice",
        message: "yo",
        source: "cli",
      },
      effectiveInput: {
        userId: "alice",
        message: "yo",
        source: "cli",
      },
      context: harness.context,
      turn: createTurn(),
      response: "",
      runFailureMessage: "provider offline",
      settingsDuring: {
        model: {
          provider: "openai",
          model: "gpt-4.1",
        },
      } as Parameters<typeof runPostProviderTurn>[0]["settingsDuring"],
      scheduleProfileObservation: () => undefined,
      loadDirectLocalIntent: async () => ({
        directLocalIntent: null,
        executeDirectLocalIntent: async () => "unused",
        isHighConfidenceDirectLocalIntent: () => false,
        requiresModelSynthesisForLocalIntent: () => false,
        shouldUseDirectLocalFallback: () => false,
      }),
      approveDirectLocalIntent: async () => undefined,
    });

    expect(result).toEqual({
      kind: "final",
      response:
        "I couldn't get a usable response from OpenAI (gpt-4.1). Check `OPENAI_API_KEY` or switch to a linked provider with `/accounts`.",
      runFailureMessage: "provider offline",
      observedActionCount: 0,
      usedFallback: false,
    });
    expect(harness.storedMessages).toEqual([
      "I couldn't get a usable response from OpenAI (gpt-4.1). Check `OPENAI_API_KEY` or switch to a linked provider with `/accounts`.",
    ]);
    expect(harness.finishEvents).toEqual([
      {
        sessionId: "session-1",
        status: "error",
        message: "provider offline",
      },
    ]);
  });

  it("emits trimmed context and skill notices for interactive turns", async () => {
    const notices: Array<{ kind: string; message: string }> = [];
    const harness = createContext({
      assistantTurnCount: 12,
      recentMessages: new Array(6).fill({
        text: "recent message",
      }),
      contextCompression: {
        isApproachingLimit: () => true,
        measure: () => ({
          usageFraction: 0.8,
          estimatedTokens: 1234,
        }),
      },
      skillSynthesis: {
        analyzeConversation: () => ({
          shouldSynthesize: true,
          candidate: {
            title: "Workspace cleanup routine",
          },
        }),
      },
    });

    const result = await runPostProviderTurn({
      input: {
        userId: "alice",
        message: "summarize the repo",
        source: "cli",
      },
      effectiveInput: {
        userId: "alice",
        message: "summarize the repo",
        source: "cli",
      },
      context: harness.context,
      options: {
        onNotice: async (notice) => {
          notices.push({
            kind: notice.kind,
            message: notice.message,
          });
        },
      },
      turn: createTurn(),
      response: "Repo summary",
      settingsDuring: {
        model: {
          provider: "openai",
          model: "gpt-4.1",
        },
      } as Parameters<typeof runPostProviderTurn>[0]["settingsDuring"],
      scheduleProfileObservation: () => undefined,
      loadDirectLocalIntent: async () => ({
        directLocalIntent: null,
        executeDirectLocalIntent: async () => "unused",
        isHighConfidenceDirectLocalIntent: () => false,
        requiresModelSynthesisForLocalIntent: () => false,
        shouldUseDirectLocalFallback: () => false,
      }),
      approveDirectLocalIntent: async () => undefined,
    });

    expect(result).toEqual({
      kind: "final",
      response: "Repo summary",
      runFailureMessage: undefined,
      observedActionCount: 0,
      usedFallback: false,
    });
    expect(notices).toEqual([
      {
        kind: "context",
        message:
          "💡 Context window at 80% — consider starting a new session for unrelated tasks.",
      },
      {
        kind: "skills",
        message:
          '💡 **Skill synthesis available**: This conversation contains a reusable workflow — "Workspace cleanup routine". Run `/skills synthesize latest` to save it as a skill document, or I can do it automatically.',
      },
    ]);
  });
});
