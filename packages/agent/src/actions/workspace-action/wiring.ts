import type {
  Action,
  ActionResult,
  HandlerCallback,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import type { AppServices } from "@/services";
import { executeWorkspaceIntent } from "./execution";
import { WORKSPACE_ACTION_FALLBACK_MESSAGE } from "./output";
import {
  readWorkspaceActionText,
  resolveWorkspaceActionIntent,
  resolveWorkspaceIntentFromText,
} from "./parsing";

export function createWorkspaceAction(
  services: AppServices,
  workspaceDir: string,
): Action {
  return {
    name: "DOOLITTLE_WORKSPACE",
    similes: [
      "WORKSPACE_TREE",
      "WORKSPACE_READ",
      "WORKSPACE_SEARCH",
      "WORKSPACE_WRITE",
    ],
    description:
      "Explores the local workspace. Use this to list files, read a file, search the repo, or write a file when the user asks directly.",
    validate: async (_runtime: IAgentRuntime, message: Memory) => {
      const text = readWorkspaceActionText(message);
      return Boolean(text && resolveWorkspaceIntentFromText(text));
    },
    handler: async (
      runtime: IAgentRuntime,
      message: Memory,
      _state: State | undefined,
      options: HandlerOptions | undefined,
      callback?: HandlerCallback,
    ): Promise<ActionResult> => {
      const text = readWorkspaceActionText(message);
      const intent = resolveWorkspaceActionIntent(options, text);
      const response = intent
        ? await executeWorkspaceIntent(runtime, services, workspaceDir, intent)
        : WORKSPACE_ACTION_FALLBACK_MESSAGE;

      await callback?.({ text: response, source: "workspace-action" });
      return { success: Boolean(intent), text: response };
    },
    examples: [
      [
        {
          name: "{{userName}}",
          content: { text: "Search the workspace for linked provider auth." },
        },
        {
          name: "{{agentName}}",
          content: {
            text: "packages/agent/src/runtime/native/account-auth.ts",
            actions: ["DOOLITTLE_WORKSPACE"],
          },
        },
      ],
    ],
  };
}
