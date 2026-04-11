import { describe, expect, it, mock } from "bun:test";
import type { AgentExecutionContext } from "@/runtime/chat";
import {
  buildPreferredLocalIntentSynthesisPrelude,
  type createDirectLocalIntentLoader,
  executeApprovedDirectLocalIntent,
  runPreferredLocalIntentFastPath,
} from "./chat-turn/local-intent-orchestration";
import type { TurnState } from "./chat-turn/state";

function createContext() {
  const storedMessages: string[] = [];
  const runEvents: string[] = [];

  const context = {
    services: {
      sessions: {
        storeMessage: (message: { text: string }) => {
          storedMessages.push(message.text);
        },
      },
      runController: {
        setPendingApprovals: (sessionId: string, count: number) => {
          runEvents.push(`pending:${sessionId}:${count}`);
        },
        finishTurn: (sessionId: string, status: string) => {
          runEvents.push(`finish:${sessionId}:${status}`);
        },
      },
    },
  } as unknown as AgentExecutionContext;

  return {
    context,
    storedMessages,
    runEvents,
  };
}

function createInput() {
  return {
    userId: "alice",
    message: "inspect the workspace",
    source: "cli",
  };
}

function createTurn(overrides: Partial<TurnState> = {}): TurnState {
  return {
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
        maxIterations: 2,
        toolProgressMode: "all",
      },
    },
    runId: "run-1",
    ...overrides,
  } as TurnState;
}

describe("chat turn local intent orchestration", () => {
  it("stores and returns shell approval prompts before direct execution", async () => {
    const harness = createContext();

    const response = await executeApprovedDirectLocalIntent(
      createInput(),
      harness.context,
      undefined,
      createTurn(),
      { label: "shell:git diff --stat" },
      undefined,
      {
        maybeRequireRemoteExecutionApproval: async () => "approval required",
      },
    );

    expect(response).toBe("approval required");
    expect(harness.storedMessages).toEqual(["approval required"]);
    expect(harness.runEvents).toEqual([
      "pending:session-1:1",
      "finish:session-1:complete",
    ]);
  });

  it("surfaces approval responses from the preferred local intent fast path", async () => {
    const harness = createContext();
    const executeDirectLocalIntent = mock(async () => "should not run");
    const scheduleProfileObservation = mock(() => undefined);

    const result = await runPreferredLocalIntentFastPath(
      {
        input: createInput(),
        effectiveInput: createInput(),
        context: harness.context,
        turn: createTurn(),
        scheduleProfileObservation,
      },
      {
        createDirectLocalIntentLoader: ((_) => async () => ({
          directLocalIntent: { label: "workspace:read" },
          executeDirectLocalIntent,
          isHighConfidenceDirectLocalIntent: () => true,
          requiresModelSynthesisForLocalIntent: () => false,
          shouldUseDirectLocalFallback: () => false,
        })) as typeof createDirectLocalIntentLoader,
        executeApprovedDirectLocalIntent: async () => "approval required",
      },
    );

    expect(result.kind).toBe("approval");
    if (result.kind === "approval") {
      expect(result.response).toBe("approval required");
      expect(result.preferredLocalIntent.directLocalIntent).toEqual({
        label: "workspace:read",
      });
    }
    expect(executeDirectLocalIntent).not.toHaveBeenCalled();
    expect(scheduleProfileObservation).not.toHaveBeenCalled();
    expect(harness.storedMessages).toEqual([]);
    expect(harness.runEvents).toEqual([]);
  });

  it("executes high-confidence direct local intents and completes the turn", async () => {
    const harness = createContext();
    const executeDirectLocalIntent = mock(async () => "local inspection");
    const scheduleProfileObservation = mock(() => undefined);

    const result = await runPreferredLocalIntentFastPath(
      {
        input: createInput(),
        effectiveInput: createInput(),
        context: harness.context,
        turn: createTurn(),
        scheduleProfileObservation,
      },
      {
        createDirectLocalIntentLoader: ((_) => async () => ({
          directLocalIntent: { label: "repo:status" },
          executeDirectLocalIntent,
          isHighConfidenceDirectLocalIntent: () => true,
          requiresModelSynthesisForLocalIntent: () => false,
          shouldUseDirectLocalFallback: () => false,
        })) as typeof createDirectLocalIntentLoader,
        executeApprovedDirectLocalIntent: async () => undefined,
      },
    );

    expect(result.kind).toBe("direct-response");
    if (result.kind === "direct-response") {
      expect(result.response).toBe("local inspection");
    }
    expect(executeDirectLocalIntent).toHaveBeenCalledTimes(1);
    expect(scheduleProfileObservation).toHaveBeenCalledTimes(1);
    expect(harness.storedMessages).toEqual(["local inspection"]);
    expect(harness.runEvents).toEqual(["finish:session-1:complete"]);
  });

  it("builds the local synthesis prelude from verified inspection output", async () => {
    const executeDirectLocalIntent = mock(async () => "Verified repo facts");

    const result = await buildPreferredLocalIntentSynthesisPrelude(
      {
        input: createInput(),
        context: createContext().context,
        turn: createTurn(),
        preferredLocalIntent: {
          directLocalIntent: { label: "workspace:overview" },
          executeDirectLocalIntent,
          isHighConfidenceDirectLocalIntent: () => true,
          requiresModelSynthesisForLocalIntent: () => true,
          shouldUseDirectLocalFallback: () => false,
        },
      },
      {
        executeApprovedDirectLocalIntent: async () => undefined,
      },
    );

    expect(result).toEqual({
      kind: "continue",
      localSynthesisPrelude: [
        "Local workspace inspection already executed for this turn.",
        "Use these verified repo facts in the answer instead of asking to inspect again.",
        "Verified repo facts",
      ].join("\n"),
    });
    expect(executeDirectLocalIntent).toHaveBeenCalledTimes(1);
  });
});
