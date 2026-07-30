import type {
  Action,
  ActionResult,
  HandlerCallback,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import {
  getNativeRepositoryDiff,
  getNativeRepositoryLog,
  getNativeRepositoryStatus,
} from "@/runtime/native/service-bridge/tooling";

type RepositoryIntent = "status" | "diff" | "log";

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function resolveRepositoryIntentFromParams(
  params: unknown,
): RepositoryIntent | undefined {
  if (!params || typeof params !== "object") {
    return undefined;
  }
  const record = params as Record<string, unknown>;
  const raw = nonEmptyString(record.intent);
  if (raw === "status" || raw === "diff" || raw === "log") {
    return raw;
  }
  return undefined;
}

export function resolveRepositoryCommandIntent(
  text: string,
): RepositoryIntent | undefined {
  const trimmed = text.trim();
  if (trimmed === "/repo" || trimmed === "/repo status") {
    return "status";
  }
  if (trimmed === "/repo diff") {
    return "diff";
  }
  if (trimmed === "/repo log") {
    return "log";
  }

  return undefined;
}

export async function executeRepositoryIntent(
  runtime: IAgentRuntime,
  intent: RepositoryIntent,
): Promise<string> {
  if (intent === "status") {
    return String(await getNativeRepositoryStatus(runtime));
  }
  if (intent === "diff") {
    return String(await getNativeRepositoryDiff(runtime));
  }
  return String(await getNativeRepositoryLog(runtime));
}

/** Shared repository command facade used by slash commands and the action. */
export async function executeRepositoryCommand(
  runtime: IAgentRuntime,
  input: string,
): Promise<string | undefined> {
  const intent = resolveRepositoryCommandIntent(input);
  return intent ? executeRepositoryIntent(runtime, intent) : undefined;
}

export function createRepositoryAction(): Action {
  return {
    name: "DOOLITTLE_REPOSITORY",
    similes: ["REPO_STATUS", "REPO_DIFF", "REPO_LOG", "GIT_STATUS"],
    description:
      "Inspects the local git repository. Use this for repository status, diffs, and recent commits.",
    descriptionCompressed: "Inspect local git status, diff, or commit history.",
    routingHint:
      "repository status, changes, or commits -> DOOLITTLE_REPOSITORY; use the selected project repository",
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
      const intent = resolveRepositoryIntentFromParams(options?.parameters);
      let response = "";

      if (intent) {
        response = await executeRepositoryIntent(runtime, intent);
      } else {
        response =
          "I can inspect repository status, diffs, or recent commits. Try `/repo status` or ask `what changed in this repo?`.";
      }

      await callback?.({ text: response, source: "repository-action" });
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
          content: { text: "What changed in this repo?" },
        },
        {
          name: "{{agentName}}",
          content: {
            text: " M packages/agent/src/cli.ts",
            actions: ["DOOLITTLE_REPOSITORY"],
          },
        },
      ],
    ],
    parameters: [
      {
        name: "intent",
        description: "Repository inspection to perform.",
        required: true,
        schema: {
          type: "string",
          enum: ["status", "diff", "log"],
        },
      },
    ],
  };
}
