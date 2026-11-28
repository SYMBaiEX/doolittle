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
import { extractCompatTextContent } from "../../packages/agent/src/runtime/chat-turn/state";
import { repeatedNoProgressContinuationFailure } from "../../packages/agent/src/runtime/chat-turn/workspace-continuation";
import { runWithTurnRuntimeScope } from "../../packages/agent/src/runtime/turn-runtime-scope";

const workdir = "/workspace/project";
const incompleteResponse = "I still need to fix the file.";

it("uses Doolittle-authored repeated-no-progress copy with accurate file-change state", () => {
  expect(repeatedNoProgressContinuationFailure([])).toBe(
    "Doolittle stopped this run before completion: the agent repeated the same unsuccessful action outcome in consecutive continuation passes without new workspace evidence. No verified file changes were recorded. Inspect the workspace, adjust the approach, then retry the remaining step.",
  );
  expect(repeatedNoProgressContinuationFailure([mutation()])).toBe(
    "Doolittle stopped this run before completion: the agent repeated the same unsuccessful action outcome in consecutive continuation passes without new workspace evidence. Partial file changes are preserved. Inspect the workspace, adjust the approach, then retry the remaining step.",
  );
});

function failedCommand(
  input: { command?: string; stderr?: string } = {},
): ActionResult {
  const stderr = input.stderr ?? "assertion failed: expected 2 received 1";
  return {
    success: true,
    text: stderr,
    data: {
      actionName: "SHELL",
      command: input.command ?? "bun run test",
      executedIn: workdir,
      exitCode: 1,
      stdout: "",
      stderr,
      success: false,
    },
  };
}

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
  actionResults: ActionResult[],
): MessageProcessingResult {
  return {
    outcome: { status: "completed", effects: [] },
    didRespond: true,
    responseMessages: [],
    responseContent: { text: response },
    actionResults,
  } as MessageProcessingResult;
}

async function runContinuationTurn(
  passes: MessageProcessingResult[],
  maxIterations = 5,
) {
  const memory = {
    id: randomUUID(),
    agentId: randomUUID(),
    entityId: randomUUID(),
    roomId: "chat",
    content: { text: "Fix the file" },
  } as Memory;
  const remainingPasses = [...passes];
  const handleMessage = vi.fn(async () => {
    const next = remainingPasses.shift();
    if (!next) throw new Error("Unexpected continuation pass.");
    return next;
  });
  const runtime = {
    actions: [],
    getSetting: () => undefined,
    getMemoriesByIds: async () => [memory],
    messageService: { handleMessage },
    logger: { warn: vi.fn() },
  } as unknown as IAgentRuntime;
  const onNotice = vi.fn();
  const streamState = createProviderStreamState({
    resolveStreamingUpdate,
    extractCompatTextContent,
  });

  const result = await runWithTurnRuntimeScope(
    runtime,
    { settings: new Map(), settledActionResults: [] },
    () =>
      executeProviderMessageTurn({
        context: {
          runtime,
          config: {},
          services: {
            sessions: { recentBySession: () => [] },
            workspace: { root: () => workdir },
          },
        } as unknown as AgentExecutionContext,
        memory,
        roomId: "chat",
        connectionSource: "desktop",
        abortSignal: undefined,
        streamState,
        messagePolicy: { maxIterations },
        settingsDuring: {
          model: {
            provider: "offline",
            model: "offline",
            baseUrl: "",
            temperature: 0,
            maxTokens: 128,
          },
        },
        onNotice,
        buildProviderFailureMessage: (_provider, _model, error) =>
          error instanceof Error
            ? (error.stack ?? error.message)
            : "No model available",
      }),
  );

  return { handleMessage, onNotice, result, streamState };
}

it("stops a repeated same-action same-outcome continuation loop without speaking for the agent", async () => {
  const { handleMessage, onNotice, result, streamState } =
    await runContinuationTurn([
      pass(incompleteResponse, [failedCommand()]),
      pass(incompleteResponse, [failedCommand()]),
      pass(incompleteResponse, [failedCommand()]),
    ]);

  expect(handleMessage).toHaveBeenCalledTimes(2);
  expect(result.runFailureMessage).toBe(
    repeatedNoProgressContinuationFailure(result.actionResults),
  );
  expect(result.runFailureMessage).toContain(
    "repeated the same unsuccessful action outcome",
  );
  expect(result.response).toBe(incompleteResponse);
  expect(streamState.getResponse()).toBe(incompleteResponse);
  expect(onNotice).toHaveBeenCalledTimes(1);
  expect(onNotice).toHaveBeenCalledWith({
    kind: "status",
    message: result.runFailureMessage,
  });
});

it("continues legitimate varied install retries instead of stopping for no-progress", async () => {
  const { handleMessage, onNotice, result } = await runContinuationTurn(
    [
      pass(incompleteResponse, [
        failedCommand({
          command: "bun install",
          stderr: "network timeout while fetching registry metadata",
        }),
      ]),
      pass(incompleteResponse, [
        failedCommand({
          command: "bun install --force",
          stderr: "network timeout while fetching registry metadata",
        }),
      ]),
      pass(incompleteResponse, [
        failedCommand({
          command: "bun install --offline",
          stderr: "package is not present in the offline cache",
        }),
      ]),
    ],
    3,
  );

  expect(handleMessage).toHaveBeenCalledTimes(3);
  expect(result.runFailureMessage).toBeTruthy();
  expect(result.runFailureMessage).not.toContain(
    "repeated the same unsuccessful action outcome",
  );
  expect(onNotice).not.toHaveBeenCalledWith({
    kind: "status",
    message: repeatedNoProgressContinuationFailure(result.actionResults),
  });
});

it("resets consecutive non-progress tracking after a progress-making pass", async () => {
  const repeatedFailure = {
    command: "bun run test",
    stderr: "assertion failed: expected 2 received 1",
  };
  const { handleMessage, result } = await runContinuationTurn(
    [
      pass(incompleteResponse, [failedCommand(repeatedFailure)]),
      pass("I still need to run tests.", [mutation()]),
      pass(incompleteResponse, [failedCommand(repeatedFailure)]),
    ],
    3,
  );

  expect(handleMessage).toHaveBeenCalledTimes(3);
  expect(result.runFailureMessage).not.toContain(
    "repeated the same unsuccessful action outcome",
  );
});
