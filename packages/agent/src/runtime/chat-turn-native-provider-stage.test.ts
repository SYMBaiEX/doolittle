import { describe, expect, it, mock } from "bun:test";
import type { AgentExecutionContext } from "@/runtime/chat";
import { runNativeProviderStage } from "./chat-turn/native/provider-stage";

function createTurnSetup() {
  return {
    turn: {
      agentName: "Doolittle",
      localInteractive: true,
      connectionSource: "cli",
      sessionId: "session-1",
      roomId: "room-1",
      worldId: "world-1",
      entityId: "user-1",
      messageServerId: "server-1",
      settings: {
        agent: {
          runDepth: "standard",
          maxIterations: 4,
          toolProgressMode: "all",
        },
      },
      runId: "run-1",
    },
    scheduleProfileObservation: () => undefined,
    derivedTurnPolicy: {
      useMultiStep: false,
      maxIterations: 4,
    },
    turnClassification: {
      simpleChat: false,
      likelyLocalTask: false,
      requiresFullContext: false,
      actionOriented: false,
      informationalOnly: false,
      shouldUseMultiStep: false,
    },
    settingsBefore: {
      model: {
        provider: "openai",
        model: "gpt-4.1",
      },
    },
  } as Parameters<typeof runNativeProviderStage>[0]["turnSetup"];
}

function createPerf() {
  const mark = mock((_phase: string) => undefined);
  const flush = mock(
    (
      _logger: AgentExecutionContext["runtime"]["logger"] | undefined,
      _metadata: Record<string, unknown>,
    ) => undefined,
  );

  return {
    perf: {
      mark,
      flush,
    } as Parameters<typeof runNativeProviderStage>[0]["perf"],
    mark,
    flush,
  };
}

describe("chat turn native provider stage", () => {
  it("routes informational turns through provider execution instead of cache", async () => {
    const runProviderModelTurn = mock(async () => ({
      handledMessage: true,
      response: "fresh model reply",
      messageId: "message-1",
      actionResults: [],
    }));
    const runPostProviderTurn = mock(async () => ({
      kind: "final" as const,
      response: "fresh model reply",
      observedActionCount: 0,
      usedFallback: false,
    }));
    const context = {
      runtime: {},
    } as unknown as AgentExecutionContext;

    const result = await runNativeProviderStage(
      {
        input: {
          userId: "alice",
          message: "what changed",
          source: "cli",
        },
        effectiveInput: {
          userId: "alice",
          message: "what changed",
          source: "cli",
        },
        context,
        perf: createPerf().perf,
        turnSetup: createTurnSetup(),
        settingsDuring: {
          model: {
            provider: "openai",
            model: "gpt-4.1",
          },
        } as Parameters<typeof runNativeProviderStage>[0]["settingsDuring"],
        loadDirectLocalIntent: async () => ({
          directLocalIntent: null,
          executeDirectLocalIntent: async () => "unused",
          isHighConfidenceDirectLocalIntent: () => false,
          requiresModelSynthesisForLocalIntent: () => false,
          shouldUseDirectLocalFallback: () => false,
        }),
        preferredLocalIntent: null,
        approveDirectLocalIntent: async () => undefined,
      },
      {
        createModelInputAssembly: () => ({
          capabilityProfile: "full",
          requiresPreferredLocalIntentSynthesis: false,
          build: () => ({
            messagePrelude: "",
            effectiveMessage: "expanded request",
          }),
        }),
        buildPreferredLocalIntentSynthesisPrelude: async () => ({
          kind: "continue",
          localSynthesisPrelude: "",
        }),
        getProviderReadinessMessage: async () => undefined,
        handleReadyResponseTurn: async () => undefined,
        runProviderModelTurn,
        runPostProviderTurn,
      },
    );

    expect(result).toBe("fresh model reply");
    expect(runProviderModelTurn).toHaveBeenCalledTimes(1);
    expect(runPostProviderTurn).toHaveBeenCalledTimes(1);
  });

  it("marks and flushes perf metadata after a finalized provider response", async () => {
    const logger = {} as unknown as AgentExecutionContext["runtime"]["logger"];
    const context = {
      runtime: {
        logger,
      },
    } as unknown as AgentExecutionContext;
    const { perf, mark, flush } = createPerf();

    const result = await runNativeProviderStage(
      {
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
        context,
        perf,
        turnSetup: createTurnSetup(),
        settingsDuring: {
          model: {
            provider: "openai",
            model: "gpt-4.1",
          },
        } as Parameters<typeof runNativeProviderStage>[0]["settingsDuring"],
        loadDirectLocalIntent: async () => ({
          directLocalIntent: null,
          executeDirectLocalIntent: async () => "unused",
          isHighConfidenceDirectLocalIntent: () => false,
          requiresModelSynthesisForLocalIntent: () => false,
          shouldUseDirectLocalFallback: () => false,
        }),
        preferredLocalIntent: null,
        approveDirectLocalIntent: async () => undefined,
      },
      {
        createModelInputAssembly: () => ({
          capabilityProfile: "full",
          requiresPreferredLocalIntentSynthesis: false,
          build: () => ({
            messagePrelude: "",
            effectiveMessage: "expanded request",
          }),
        }),
        buildPreferredLocalIntentSynthesisPrelude: async () => ({
          kind: "continue",
          localSynthesisPrelude: "",
        }),
        getProviderReadinessMessage: async () => undefined,
        handleReadyResponseTurn: async () => undefined,
        runProviderModelTurn: async () => ({
          handledMessage: true,
          response: "provider result",
          messageId: "message-1",
          actionResults: [],
        }),
        runPostProviderTurn: async () => ({
          kind: "final",
          response: "local fallback",
          observedActionCount: 2,
          usedFallback: true,
        }),
      },
    );

    expect(result).toBe("local fallback");
    expect(mark.mock.calls.map(([phase]) => phase)).toEqual([
      "provider-readiness",
      "native-handle-message",
      "fallback-local-intent",
      "post-response",
    ]);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush.mock.calls[0]).toEqual([
      logger,
      {
        path: "native-response",
        sessionId: "session-1",
        source: "cli",
        observedActionCount: 2,
      },
    ]);
  });
});
