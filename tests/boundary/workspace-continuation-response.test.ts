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
import { incompleteAdmittedWorkspaceFailure } from "../../packages/agent/src/runtime/chat-turn/workspace-continuation";
import { runWithTurnRuntimeScope } from "../../packages/agent/src/runtime/turn-runtime-scope";

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

it("uses concise Doolittle-authored continuation exhaustion copy with accurate file-change state", () => {
  expect(incompleteAdmittedWorkspaceFailure([])).toBe(
    "Doolittle stopped this run before completion: the agent acknowledged unfinished implementation or verification and did not verify a correction. No verified file changes were recorded. Inspect the workspace, then retry the remaining step.",
  );
  expect(incompleteAdmittedWorkspaceFailure([mutation()])).toBe(
    "Doolittle stopped this run before completion: the agent acknowledged unfinished implementation or verification and did not verify a correction. Partial file changes are preserved. Inspect the workspace, then retry the remaining step.",
  );
});

it("keeps the agent's admitted response separate from the continuation supervisor notice", async () => {
  const agentResponse = "I still need to fix the remaining edge case.";
  const sdkResult = {
    outcome: { status: "completed", effects: [] },
    didRespond: true,
    responseMessages: [],
    responseContent: { text: agentResponse },
    actionResults: [mutation()],
  } as MessageProcessingResult;
  const handleMessage = vi.fn(async () => sdkResult);
  const runtime = {
    actions: [],
    getSetting: () => undefined,
    messageService: { handleMessage },
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
        memory: {
          id: randomUUID(),
          content: { text: "Fix the file" },
          roomId: "chat",
        } as Memory,
        roomId: "chat",
        connectionSource: "desktop",
        abortSignal: undefined,
        streamState,
        messagePolicy: { maxIterations: 1 },
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

  expect(result.response).toBe(agentResponse);
  expect(result.runFailureMessage).toBe(
    incompleteAdmittedWorkspaceFailure(result.actionResults),
  );
  expect(result.runFailureMessage).toContain(
    "Partial file changes are preserved.",
  );
  expect(onNotice).toHaveBeenCalledWith({
    kind: "status",
    message: result.runFailureMessage,
  });
  expect(streamState.getResponse()).toBe(agentResponse);
});
