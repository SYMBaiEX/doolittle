import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "@/runtime/chat";
import { runSlashCommandTurn } from "./command";
import type { PreparedTurnState } from "./state";

function createContext(state: {
  startPayloads: Array<Record<string, unknown>>;
  finishPayloads: Array<{ sessionId: string; status: string }>;
  messages: Array<{ role: string; text: string }>;
}): AgentExecutionContext {
  return {
    runtime: {
      logger: {
        info: () => undefined,
      },
    },
    services: {
      executionApprovals: {
        latestPendingForSession: () => null,
      },
      runController: {
        startTurn: (payload: unknown) => {
          state.startPayloads.push(payload as Record<string, unknown>);
        },
        finishTurn: (sessionId: string, status: string) => {
          state.finishPayloads.push({ sessionId, status });
        },
      },
      sessions: {
        storeMessage: (message: { role: string; text: string }) => {
          state.messages.push(message);
        },
      },
      settings: {
        get: () => ({
          agent: {
            runDepth: "standard",
            maxIterations: 2,
            toolProgressMode: "all",
          },
        }),
      },
    },
    config: {},
  } as unknown as AgentExecutionContext;
}

function createPreparedTurn(
  context: AgentExecutionContext,
  calls: { scheduled: number },
): PreparedTurnState {
  return {
    turn: {
      agentName: "Doolittle",
      localInteractive: true,
      connectionSource: "cli",
      sessionId: "room:alice",
      roomId: "chat-room",
      worldId: "world-1",
      entityId: "entity-1",
      messageServerId: "server-1",
      settings: context.services.settings.get(),
      runId: "run-1",
    },
    scheduleProfileObservation: () => {
      calls.scheduled += 1;
    },
  };
}

describe("slash command turn runner", () => {
  it("returns undefined when the command layer does not handle the input", async () => {
    const state = {
      startPayloads: [] as Array<Record<string, unknown>>,
      finishPayloads: [] as Array<{ sessionId: string; status: string }>,
      messages: [] as Array<{ role: string; text: string }>,
    };
    const context = createContext(state);
    const perfFlushes: unknown[] = [];

    const response = await runSlashCommandTurn(
      {
        input: {
          userId: "alice",
          message: "/not-handled",
          source: "cli",
        },
        context,
        perf: {
          flush: (_logger, metadata) => {
            perfFlushes.push(metadata);
          },
        },
        preparedTurn: createPreparedTurn(context, { scheduled: 0 }),
      },
      {
        buildCommandResponse: async () => undefined,
        runAnalysis: async () => "analysis",
        runDelegationTaskInWorker: async () =>
          ({ id: "task-1" }) as ReturnType<
            AgentExecutionContext["services"]["delegation"]["get"]
          >,
      },
    );

    expect(response).toBeUndefined();
    expect(state.startPayloads).toHaveLength(0);
    expect(state.finishPayloads).toHaveLength(0);
    expect(state.messages).toHaveLength(0);
    expect(perfFlushes).toHaveLength(0);
  });

  it("tracks lifecycle and stores both user and assistant messages for handled commands", async () => {
    const state = {
      startPayloads: [] as Array<Record<string, unknown>>,
      finishPayloads: [] as Array<{ sessionId: string; status: string }>,
      messages: [] as Array<{ role: string; text: string }>,
    };
    const context = createContext(state);
    const perfFlushes: unknown[] = [];
    const scheduler = { scheduled: 0 };

    const response = await runSlashCommandTurn(
      {
        input: {
          userId: "alice",
          message: "/skills catalog search logger",
          source: "cli",
        },
        context,
        perf: {
          flush: (_logger, metadata) => {
            perfFlushes.push(metadata);
          },
        },
        preparedTurn: createPreparedTurn(context, scheduler),
      },
      {
        buildCommandResponse: async () => "command-response",
        runAnalysis: async () => "analysis",
        runDelegationTaskInWorker: async () =>
          ({ id: "task-1" }) as ReturnType<
            AgentExecutionContext["services"]["delegation"]["get"]
          >,
      },
    );

    expect(response).toBe("command-response");
    expect(state.startPayloads).toHaveLength(1);
    expect(state.finishPayloads).toEqual([
      { sessionId: "room:alice", status: "complete" },
    ]);
    expect(state.messages).toHaveLength(2);
    expect(state.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(scheduler.scheduled).toBe(1);
    expect(perfFlushes).toEqual([
      {
        path: "slash-command",
        sessionId: "room:alice",
        source: "cli",
      },
    ]);
  });
});
