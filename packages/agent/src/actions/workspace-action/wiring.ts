import type {
  Action,
  ActionResult,
  HandlerCallback,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import { executeWorkspaceIntent } from "./execution";
import { WORKSPACE_ACTION_FALLBACK_MESSAGE } from "./output";
import { resolveWorkspaceActionIntent } from "./parsing";

const WORKSPACE_PARAMETERS: NonNullable<Action["parameters"]> = [
  {
    name: "intent",
    description: "Broad workspace operation to perform.",
    required: true,
    schema: {
      type: "string",
      enum: ["tree", "overview", "find-codebase"],
    },
  },
  {
    name: "path",
    description: "Optional project, directory, or file path.",
    required: false,
    schema: { type: "string" },
  },
  {
    name: "query",
    description: "Search query or local codebase name.",
    required: false,
    schema: { type: "string" },
  },
];

export function createWorkspaceAction(): Action {
  return {
    name: "DOOLITTLE_WORKSPACE",
    similes: ["WORKSPACE_TREE", "WORKSPACE_OVERVIEW", "FIND_CODEBASE"],
    description:
      "Inspect the selected project at a broad level. Use this for workspace trees, project overviews, and locating a local codebase. Use the dedicated file actions for concrete reads, searches, and edits.",
    descriptionCompressed:
      "Summarize or inspect the selected workspace at a broad level.",
    routingHint:
      "project or workspace overview -> DOOLITTLE_WORKSPACE; concrete file work -> file actions",
    parameters: WORKSPACE_PARAMETERS,
    contexts: ["code", "files"],
    cacheStable: true,
    validate: async () => true,
    handler: async (
      runtime: IAgentRuntime,
      _message: Memory,
      _state: State | undefined,
      options: HandlerOptions | undefined,
      callback?: HandlerCallback,
    ): Promise<ActionResult> => {
      const intent = resolveWorkspaceActionIntent(options);
      const response = intent
        ? await executeWorkspaceIntent(runtime, intent)
        : WORKSPACE_ACTION_FALLBACK_MESSAGE;

      await callback?.({ text: response, source: "workspace-action" });
      return {
        success: Boolean(intent),
        text: response,
        userFacingText: response,
        verifiedUserFacing: Boolean(intent),
      };
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
