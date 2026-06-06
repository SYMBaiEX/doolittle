import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "@/runtime/chat";
import { runPostProviderTurn } from "./chat-turn/post-provider";

function createContext(
  input: {
    observedActionCount?: number;
    localMutations?: Array<{
      action: string;
      requestedPath?: string;
      resolvedPath?: string;
      success: boolean;
      message?: string;
      recordedAt: string;
    }>;
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
          localMutations: input.localMutations ?? [],
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

  it("fails local execution turns when the provider returns an empty action wrapper", async () => {
    const harness = createContext({ observedActionCount: 0 });

    const result = await runPostProviderTurn({
      input: {
        userId: "alice",
        message:
          "create a folder named the-game in symbiex/dev and write html css js files",
        source: "cli",
      },
      effectiveInput: {
        userId: "alice",
        message:
          "create a folder named the-game in symbiex/dev and write html css js files",
        source: "cli",
      },
      context: harness.context,
      turn: createTurn(),
      response: "🔎 Provider executed: []",
      settingsDuring: {
        model: {
          provider: "devin",
          model: "swe-1-6-fast",
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
        "Native planning failed: the provider returned no executable actions for a local execution request.",
      runFailureMessage:
        "Native planning failed: the provider returned no executable actions for a local execution request.",
      observedActionCount: 0,
      usedFallback: false,
    });
    expect(harness.finishEvents).toEqual([
      {
        sessionId: "session-1",
        status: "error",
        message:
          "Native planning failed: the provider returned no executable actions for a local execution request.",
      },
    ]);
  });

  it("fails file mutation turns when actions ran but no mutation receipt landed", async () => {
    const harness = createContext({ observedActionCount: 2 });

    const result = await runPostProviderTurn({
      input: {
        userId: "alice",
        message: "create a website file in symbiex/dev/the-game",
        source: "cli",
      },
      effectiveInput: {
        userId: "alice",
        message: "create a website file in symbiex/dev/the-game",
        source: "cli",
      },
      context: harness.context,
      turn: createTurn(),
      response: "Done.",
      settingsDuring: {
        model: {
          provider: "devin",
          model: "swe-1-6-fast",
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

    expect(result.kind).toBe("final");
    if (result.kind !== "final") {
      throw new Error("expected final result");
    }
    expect(result.runFailureMessage).toBe(
      "Native execution failed: the requested file change did not produce an SDK action-result mutation receipt.",
    );
    expect(harness.finishEvents).toEqual([
      {
        sessionId: "session-1",
        status: "error",
        message:
          "Native execution failed: the requested file change did not produce an SDK action-result mutation receipt.",
      },
    ]);
  });

  it("accepts file mutation turns when SDK action-result metadata exists", async () => {
    const harness = createContext({ observedActionCount: 0 });

    const result = await runPostProviderTurn({
      input: {
        userId: "alice",
        message: "create a website file in symbiex/dev/the-game",
        source: "cli",
      },
      effectiveInput: {
        userId: "alice",
        message: "create a website file in symbiex/dev/the-game",
        source: "cli",
      },
      context: harness.context,
      turn: createTurn(),
      response: "Created `/Users/symbiex/dev/the-game/index.html`.",
      actionResults: [
        {
          success: true,
          text: "Wrote: /Users/symbiex/dev/the-game/index.html",
          data: {
            actionName: "WRITE_FILE",
            mutationKind: "local-file",
            mutation: {
              action: "WRITE_FILE",
              requestedPath: "symbiex/dev/the-game/index.html",
              resolvedPath: "/Users/symbiex/dev/the-game/index.html",
              success: true,
              message: "Wrote: /Users/symbiex/dev/the-game/index.html",
            },
            fileOperation: {
              type: "write",
              target: "symbiex/dev/the-game/index.html",
            },
          },
        },
      ],
      settingsDuring: {
        model: {
          provider: "devin",
          model: "swe-1-6-fast",
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

    expect(result).toMatchObject({
      kind: "final",
      runFailureMessage: undefined,
      observedActionCount: 1,
      usedFallback: false,
    });
    expect(harness.finishEvents).toEqual([
      {
        sessionId: "session-1",
        status: "complete",
        message: undefined,
      },
    ]);
  });

  it("accepts shell-scaffolded turns when a successful RUN_IN_TERMINAL command landed", async () => {
    const harness = createContext({ observedActionCount: 0 });
    const scaffoldMessage =
      'Go to ~/symbiex/dev and create a folder named "the-game". In the folder, build a react app (use bunx or npx to scaffold from an official boilerplate).';

    const result = await runPostProviderTurn({
      input: {
        userId: "alice",
        message: scaffoldMessage,
        source: "cli",
      },
      effectiveInput: {
        userId: "alice",
        message: scaffoldMessage,
        source: "cli",
      },
      context: harness.context,
      turn: createTurn(),
      response: "Scaffolded the-game.",
      actionResults: [
        {
          success: true,
          text: "bunx create-vite the-game --template react",
          data: {
            actionName: "RUN_IN_TERMINAL",
            commandResult: {
              command: "bunx create-vite the-game --template react",
              exitCode: 0,
              stdout: "Scaffolding project in ~/dev/the-game...",
              stderr: "",
              executedIn: "/Users/symbiex/dev",
              success: true,
            },
          },
        },
      ],
      settingsDuring: {
        model: {
          provider: "devin",
          model: "swe-1-6-fast",
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

    expect(result).toMatchObject({
      kind: "final",
      runFailureMessage: undefined,
      observedActionCount: 1,
      usedFallback: false,
    });
    expect(harness.finishEvents).toEqual([
      {
        sessionId: "session-1",
        status: "complete",
        message: undefined,
      },
    ]);
  });
});
