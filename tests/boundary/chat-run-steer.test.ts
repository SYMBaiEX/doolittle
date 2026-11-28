import { randomUUID } from "node:crypto";
import type {
  ActionResult,
  IAgentRuntime,
  Memory,
  MessageProcessingResult,
} from "@elizaos/core";
import { resolveStreamingUpdate } from "@elizaos/shared/utils/streaming-text";
import { expect, it, vi } from "vitest";
import type { AgentExecutionContext } from "../../packages/agent/src/runtime/chat";
import { executeProviderMessageTurn } from "../../packages/agent/src/runtime/chat-turn/provider-handler";
import { createProviderStreamState } from "../../packages/agent/src/runtime/chat-turn/provider-streaming";
import {
  extractCompatTextContent,
  type TurnState,
} from "../../packages/agent/src/runtime/chat-turn/state";
import { submitRunSteer } from "../../packages/agent/src/runtime/chat-turn/steer";
import { continuationMemory } from "../../packages/agent/src/runtime/chat-turn/workspace-continuation";
import { workspaceNoopRequirements } from "../../packages/agent/src/runtime/chat-turn/workspace-noop-completion";
import { TurnContinuationBudget } from "../../packages/agent/src/runtime/turn-runtime-scope";

const workdir = "/workspace/project";

function mutation(path = `${workdir}/src/index.ts`): ActionResult {
  return {
    success: true,
    text: "workspace file changed",
    data: {
      actionName: "WRITE_FILE",
      mutationKind: "local-file",
      mutationAction: "WRITE_FILE",
      mutation: { action: "WRITE_FILE", success: true, resolvedPath: path },
    },
  };
}

function pass(
  response: string,
  actionResults: ActionResult[] = [mutation()],
): MessageProcessingResult {
  return {
    outcome: { status: "completed", effects: [] },
    didRespond: true,
    responseMessages: [],
    responseContent: { text: response },
    actionResults,
  } as MessageProcessingResult;
}

function turnState(runId: string, sessionId: string): TurnState {
  const uuid = () => randomUUID();
  return {
    agentName: "Doolittle",
    localInteractive: true,
    connectionSource: "desktop",
    sessionId,
    roomId: uuid(),
    worldId: uuid(),
    entityId: uuid(),
    messageServerId: uuid(),
    messageId: uuid(),
    settings: {
      agent: {
        runDepth: "standard",
        maxIterations: 45,
        toolProgressMode: "new",
      },
      model: {},
    },
    runId,
  } as TurnState;
}

function harness(input: {
  prompt: string;
  maxIterations?: number;
  onPass?: (passNumber: number) => Promise<void> | void;
}) {
  const runId = randomUUID();
  const sessionId = `session-${randomUUID()}`;
  const turn = turnState(runId, sessionId);
  const original: Memory = {
    id: turn.messageId as Memory["id"],
    agentId: randomUUID() as Memory["agentId"],
    entityId: turn.entityId as Memory["entityId"],
    roomId: turn.roomId as Memory["roomId"],
    content: { text: input.prompt, source: "desktop" },
    createdAt: Date.now(),
  };
  const notices: string[] = [];
  const passPrompts: string[] = [];
  const createdMemories: Memory[] = [];
  const projectedMessages: Array<{
    id: string;
    role: string;
    text: string;
  }> = [];
  const handleMessage = vi.fn(
    async (_runtime: IAgentRuntime, memory: Memory) => {
      passPrompts.push(
        typeof memory.content?.text === "string" ? memory.content.text : "",
      );
      await input.onPass?.(passPrompts.length);
      return pass(
        passPrompts.length === 1
          ? "Completed the requested edit."
          : "Adjusted course.",
      );
    },
  );
  const runtime = {
    actions: [],
    agentId: original.agentId,
    createMemory: vi.fn(async (memory: Memory) => {
      createdMemories.push(structuredClone(memory));
      return memory.id;
    }),
    getMemoriesByIds: async (ids: string[]) =>
      ids.flatMap((id) => {
        if (id === original.id) return [structuredClone(original)];
        const created = createdMemories.find((memory) => memory.id === id);
        return created ? [structuredClone(created)] : [];
      }),
    getSetting: () => undefined,
    logger: { warn: vi.fn() },
    messageService: { handleMessage },
    queueEmbeddingGeneration: async () => undefined,
  } as unknown as IAgentRuntime;
  const context = {
    runtime,
    config: {},
    services: {
      runController: {
        getActive: () => undefined,
        getByRunId: (id: string) =>
          id === runId ? { runId, sessionId, roomId: turn.roomId } : undefined,
      },
      sessions: {
        messagesBySession: () => [],
        recentBySession: () => [],
        storeMessage: vi.fn(
          (message: { id: string; role: string; text: string }) => {
            projectedMessages.push({
              id: message.id,
              role: message.role,
              text: message.text,
            });
          },
        ),
      },
      workspace: { root: () => workdir },
    },
  } as unknown as AgentExecutionContext;
  const streamState = createProviderStreamState({
    resolveStreamingUpdate,
    extractCompatTextContent,
  });
  const continuationBudget = new TurnContinuationBudget(
    input.maxIterations ?? 45,
  );
  const execution = () =>
    executeProviderMessageTurn({
      context,
      memory: original,
      turn,
      userId: "user-1",
      continuationBudget,
      sessionId,
      runId,
      roomId: turn.roomId,
      connectionSource: "desktop",
      abortSignal: undefined,
      streamState,
      messagePolicy: { maxIterations: input.maxIterations ?? 45 },
      settingsDuring: {
        model: {
          provider: "offline",
          model: "offline",
          baseUrl: "",
          temperature: 0,
          maxTokens: 128,
        },
      },
      buildProviderFailureMessage: (_provider, _model, error) =>
        error instanceof Error ? error.message : "No model available",
      onNotice: (notice) => {
        notices.push(notice.message);
      },
    });

  return {
    context,
    createdMemories,
    execution,
    handleMessage,
    notices,
    original,
    passPrompts,
    projectedMessages,
    runId,
    sessionId,
  };
}

it("renders steer input as escaped user-authored messages in admission order", () => {
  const original = {
    id: randomUUID(),
    content: { text: "Fix the file" },
  } as Memory;
  const continuation = continuationMemory(
    original,
    "Fix the file",
    [],
    "",
    workspaceNoopRequirements("Fix the file"),
    [
      {
        id: randomUUID(),
        userId: "user-1",
        text: "Use <strict> XML & keep it small",
        sequence: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: randomUUID(),
        userId: "user-1",
        text: "Actually prefer the second approach",
        sequence: 2,
        createdAt: "2026-01-01T00:00:01.000Z",
      },
    ],
  );

  const text = String(continuation.content.text);
  expect(text).toContain(
    "user-authored, persisted in the conversation transcript",
  );
  expect(text).toContain('sequence="1"');
  expect(text).toContain("Use &lt;strict&gt; XML &amp; keep it small");
  expect(text.indexOf('sequence="1"')).toBeLessThan(
    text.indexOf('sequence="2"'),
  );
  expect(text).not.toContain("Use <strict> XML & keep it small");
});

it("persists steer as user input and presents it in a forced workspace continuation pass", async () => {
  let submission: Awaited<ReturnType<typeof submitRunSteer>> | undefined;
  const fixture = harness({
    prompt: "Fix the file",
    onPass: async (passNumber) => {
      if (passNumber !== 1) return;
      submission = await submitRunSteer({
        context: fixture.context,
        runId: fixture.runId,
        sessionId: fixture.sessionId,
        userId: "user-1",
        message: "Use the narrower fix instead",
      });
    },
  });

  const result = await fixture.execution();

  expect(submission).toMatchObject({
    accepted: true,
    runId: fixture.runId,
    sessionId: fixture.sessionId,
    delivery: "next-continuation-pass",
  });
  expect(fixture.handleMessage).toHaveBeenCalledTimes(2);
  expect(fixture.passPrompts[1]).toContain("<user_steer_messages>");
  expect(fixture.passPrompts[1]).toContain("Use the narrower fix instead");
  expect(fixture.passPrompts[1]).toContain("user-authored");
  expect(fixture.createdMemories).toHaveLength(1);
  expect(fixture.createdMemories[0]?.content.text).toBe(
    "Use the narrower fix instead",
  );
  expect(fixture.createdMemories[0]?.metadata).toMatchObject({
    doolittle: {
      role: "user",
      userId: "user-1",
      steer: { runId: fixture.runId, sequence: 1 },
    },
  });
  expect(fixture.projectedMessages).toEqual([
    {
      id: submission?.accepted === true ? submission.messageId : "",
      role: "user",
      text: "Use the narrower fix instead",
    },
  ]);
  expect(result.response).toBe("Adjusted course.");
});

it("rejects steer for an active non-mutation turn because it has no honest pass boundary", async () => {
  let submission: Awaited<ReturnType<typeof submitRunSteer>> | undefined;
  const fixture = harness({
    prompt: "Explain the file",
    onPass: async (passNumber) => {
      if (passNumber !== 1) return;
      submission = await submitRunSteer({
        context: fixture.context,
        runId: fixture.runId,
        sessionId: fixture.sessionId,
        userId: "user-1",
        message: "Also change the file",
      });
    },
  });

  await fixture.execution();

  expect(fixture.handleMessage).toHaveBeenCalledTimes(1);
  expect(submission).toMatchObject({
    accepted: false,
    code: "run_not_steerable",
  });
  expect(fixture.createdMemories).toHaveLength(0);
  expect(fixture.projectedMessages).toHaveLength(0);
});

it("rejects steer without any transcript write when durable persistence fails", async () => {
  let submission: Awaited<ReturnType<typeof submitRunSteer>> | undefined;
  const fixture = harness({
    prompt: "Fix the file",
    onPass: async (passNumber) => {
      if (passNumber !== 1) return;
      (
        fixture.context.runtime.createMemory as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(new Error("native store unavailable"));
      submission = await submitRunSteer({
        context: fixture.context,
        runId: fixture.runId,
        sessionId: fixture.sessionId,
        userId: "user-1",
        message: "Use a different fix",
      });
    },
  });

  await fixture.execution();

  expect(fixture.handleMessage).toHaveBeenCalledTimes(1);
  expect(submission).toMatchObject({
    accepted: false,
    code: "steer_persistence_failed",
  });
  expect(fixture.createdMemories).toHaveLength(0);
  expect(fixture.projectedMessages).toHaveLength(0);
});

it("reports a persisted steer honestly when abort ends the run before its pass", async () => {
  const abort = new AbortController();
  let submission: Awaited<ReturnType<typeof submitRunSteer>> | undefined;
  const fixture = harness({
    prompt: "Fix the file",
    onPass: async (passNumber) => {
      if (passNumber !== 1) return;
      submission = await submitRunSteer({
        context: fixture.context,
        runId: fixture.runId,
        sessionId: fixture.sessionId,
        userId: "user-1",
        message: "Use a different fix",
      });
      abort.abort();
    },
  });

  const abortedExecution = executeProviderMessageTurn({
    context: fixture.context,
    memory: fixture.original,
    turn: turnState(fixture.runId, fixture.sessionId),
    userId: "user-1",
    continuationBudget: new TurnContinuationBudget(45),
    sessionId: fixture.sessionId,
    runId: fixture.runId,
    roomId: fixture.original.roomId,
    connectionSource: "desktop",
    abortSignal: abort.signal,
    streamState: createProviderStreamState({
      resolveStreamingUpdate,
      extractCompatTextContent,
    }),
    messagePolicy: { maxIterations: 45 },
    settingsDuring: {
      model: {
        provider: "offline",
        model: "offline",
        baseUrl: "",
        temperature: 0,
        maxTokens: 128,
      },
    },
    buildProviderFailureMessage: (_provider, _model, error) =>
      error instanceof Error ? error.message : "No model available",
    onNotice: (notice) => {
      fixture.notices.push(notice.message);
    },
  });
  await expect(abortedExecution).rejects.toThrow(/abort|cancel/i);

  expect(submission).toMatchObject({ accepted: true });
  expect(fixture.handleMessage).toHaveBeenCalledTimes(1);
  expect(fixture.createdMemories).toHaveLength(1);
  expect(
    fixture.notices.some((message) => message.includes("not considered")),
  ).toBe(true);
});

it("rejects steer when the run has no reserved continuation-pass capacity", async () => {
  let submission: Awaited<ReturnType<typeof submitRunSteer>> | undefined;
  const fixture = harness({
    prompt: "Fix the file",
    maxIterations: 1,
    onPass: async (passNumber) => {
      if (passNumber !== 1) return;
      submission = await submitRunSteer({
        context: fixture.context,
        runId: fixture.runId,
        sessionId: fixture.sessionId,
        userId: "user-1",
        message: "Use a different fix",
      });
    },
  });

  await fixture.execution();

  expect(fixture.handleMessage).toHaveBeenCalledTimes(1);
  expect(submission).toMatchObject({
    accepted: false,
    code: "steer_budget_exhausted",
  });
  expect(fixture.createdMemories).toHaveLength(0);
});
