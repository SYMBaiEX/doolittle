import type { Content, IAgentRuntime, Memory } from "@elizaos/core";
import { resolveStreamingUpdate } from "@elizaos/shared/utils/streaming-text";
import { expect, it, vi } from "vitest";
import type { AgentExecutionContext } from "../../packages/agent/src/runtime/chat";
import { executeProviderMessageTurn } from "../../packages/agent/src/runtime/chat-turn/provider-handler";
import { createProviderStreamState } from "../../packages/agent/src/runtime/chat-turn/provider-streaming";
import { extractCompatTextContent } from "../../packages/agent/src/runtime/chat-turn/state";
import { DOOLITTLE_SHELL_SHORTCUT_ACTION } from "../../packages/agent/src/runtime/command-shortcut-match";
import {
  recordScopedTurnActionResult,
  runWithTurnRuntimeScope,
} from "../../packages/agent/src/runtime/turn-runtime-scope";

const shell = { name: DOOLITTLE_SHELL_SHORTCUT_ACTION };
const command = '!node -p "process.cwd()"';

async function runShortcut(options: {
  replies: [Content, string][];
  result?: { success: boolean };
  denied?: boolean;
}) {
  const handleMessage = vi.fn();
  const runActionsByMode = vi.fn<IAgentRuntime["runActionsByMode"]>(
    async (_mode, _memory, _state, sdkOptions) => {
      if (options.result)
        recordScopedTurnActionResult(runtime, {
          success: options.result.success,
          data: { actionName: shell.name },
        });
      for (const [content, actionName] of options.replies)
        await sdkOptions?.callback?.(content, actionName);
      return (options.denied ? [] : [shell]) as Awaited<
        ReturnType<IAgentRuntime["runActionsByMode"]>
      >;
    },
  );
  const runtime = {
    actions: [shell],
    getSetting: () => undefined,
    messageService: { handleMessage },
    runActionsByMode,
  } as unknown as IAgentRuntime;
  const streamState = createProviderStreamState({
    resolveStreamingUpdate,
    extractCompatTextContent,
  });
  const result = await runWithTurnRuntimeScope(
    runtime,
    { settings: new Map(), settledActionResults: [] },
    () =>
      executeProviderMessageTurn({
        context: { runtime, config: {}, services: {} } as AgentExecutionContext,
        memory: { content: { text: command }, roomId: "chat" } as Memory,
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
        buildProviderFailureMessage: () => "No model available",
      }),
  );
  expect(runActionsByMode).toHaveBeenCalledTimes(1);
  expect(handleMessage).not.toHaveBeenCalled();
  expect(streamState.getResponse()).toBe(result.response);
  return result;
}

it("only delivers the SDK’s verified reply from the explicitly selected shell action", async () => {
  const text = "STDOUT:\n/approved/project";
  await expect(
    runShortcut({
      replies: [
        [{ text, agentVoiced: true }, shell.name],
        [{ text: "Unverified shell text" }, shell.name],
        [{ text: "Another hook's output", agentVoiced: true }, "OTHER_HOOK"],
      ],
      result: { success: true },
    }),
  ).resolves.toMatchObject({ handledMessage: true, response: text });
});

it("rejects a reply without SDK action authorization and preserves a settled shell failure", async () => {
  const text = "Shell command failed: workspace unavailable";
  const replies: [Content, string][] = [
    [{ text, agentVoiced: true }, shell.name],
  ];
  await expect(runShortcut({ replies, denied: true })).resolves.toMatchObject({
    response: expect.stringContaining("action permissions"),
    runFailureMessage: expect.stringContaining("action permissions"),
  });
  await expect(
    runShortcut({ replies, result: { success: false } }),
  ).resolves.toMatchObject({ response: text, runFailureMessage: text });
});
