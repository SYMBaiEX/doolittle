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
      "Legacy workspace overview helper. Prefer READ_FILE, WRITE_FILE, PATCH_FILE, SEARCH_FILES, and CREATE_DIRECTORY for concrete file work; use this for broad workspace tree/overview requests.",
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
