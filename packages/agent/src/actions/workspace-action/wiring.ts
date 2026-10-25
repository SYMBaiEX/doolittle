import type {
  Action,
  ActionResult,
  HandlerCallback,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import { hasGlobalSessionOperatorAccess } from "../../runtime/session-operator-policy";
import { executeWorkspaceIntent } from "./execution";
import { WORKSPACE_ACTION_FALLBACK_MESSAGE } from "./output";
import { resolveWorkspaceActionIntent } from "./parsing";

const WORKSPACE_ACCESS_DENIED =
  "Workspace inspection is available only to a local or authenticated API operator.";

function messageSource(message: Memory): string | undefined {
  const metadata = message.metadata as
    | { doolittle?: { source?: unknown } }
    | undefined;
  const metadataSource = metadata?.doolittle?.source;
  if (typeof metadataSource === "string") return metadataSource;
  return typeof message.content?.source === "string"
    ? message.content.source
    : undefined;
}

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
    validate: async (_runtime, message) =>
      hasGlobalSessionOperatorAccess(messageSource(message)),
    handler: async (
      runtime: IAgentRuntime,
      message: Memory,
      _state: State | undefined,
      options: HandlerOptions | undefined,
      callback?: HandlerCallback,
    ): Promise<ActionResult> => {
      if (!hasGlobalSessionOperatorAccess(messageSource(message))) {
        await callback?.({
          text: WORKSPACE_ACCESS_DENIED,
          source: "workspace-action",
        });
        return {
          success: false,
          text: WORKSPACE_ACCESS_DENIED,
          userFacingText: WORKSPACE_ACCESS_DENIED,
        };
      }
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
