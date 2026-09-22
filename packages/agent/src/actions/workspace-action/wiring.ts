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
    description:
      "Project, directory, or file path. When the user names a target path, pass that exact path for tree or overview instead of listing the selected workspace root.",
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
      "Inspect a workspace tree or overview, optionally scoped to an exact project or directory path, or locate a local codebase. For coding requests, inspect only the requested target path; never dump the selected workspace root when the user named a narrower path. Use dedicated file actions for concrete reads, searches, and edits.",
    descriptionCompressed:
      "Summarize or inspect the selected workspace at a broad level.",
    routingHint:
      "workspace overview -> DOOLITTLE_WORKSPACE; if a path is named pass it as path; concrete file work -> file actions",
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
            text: "packages/agent/src/runtime/native/account-auth/index.ts",
            actions: ["DOOLITTLE_WORKSPACE"],
          },
        },
      ],
    ],
  };
}
