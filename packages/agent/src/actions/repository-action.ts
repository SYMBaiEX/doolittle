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
  getEffectiveRepositoryDiff,
  getEffectiveRepositoryLog,
  getEffectiveRepositoryStatus,
} from "@/runtime/native/service-bridge/tooling";
import type { AppServices } from "@/services";

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
  const raw =
    nonEmptyString(record.intent) ??
    nonEmptyString(record.action) ??
    nonEmptyString(record.mode) ??
    nonEmptyString(record.command);
  if (raw === "status" || raw === "diff" || raw === "log") {
    return raw;
  }
  return undefined;
}

export function resolveRepositoryIntentFromText(
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

  const lower = trimmed.toLowerCase();
  if (
    /(git status|repo status|repository status|working tree|uncommitted changes)/u.test(
      lower,
    )
  ) {
    return "status";
  }
  if (
    /(git diff|repo diff|repository diff|show diff|what changed)/u.test(lower)
  ) {
    return "diff";
  }
  if (/(git log|repo log|recent commits|commit history)/u.test(lower)) {
    return "log";
  }
  return undefined;
}

export async function executeRepositoryIntent(
  runtime: IAgentRuntime,
  services: AppServices,
  intent: RepositoryIntent,
): Promise<string> {
  if (intent === "status") {
    return String(await getEffectiveRepositoryStatus(runtime, services));
  }
  if (intent === "diff") {
    return String(await getEffectiveRepositoryDiff(runtime, services));
  }
  return String(await getEffectiveRepositoryLog(runtime, services));
}

export function createRepositoryAction(services: AppServices): Action {
  return {
    name: "DOOLITTLE_REPOSITORY",
    similes: ["REPO_STATUS", "REPO_DIFF", "REPO_LOG", "GIT_STATUS"],
    description:
      "Inspects the local git repository. Use this for repository status, diffs, and recent commits.",
    validate: async (_runtime: IAgentRuntime, message: Memory) => {
      const text =
        typeof message.content === "string"
          ? message.content
          : message.content?.text;
      return Boolean(text && resolveRepositoryIntentFromText(text));
    },
    handler: async (
      runtime: IAgentRuntime,
      message: Memory,
      _state: State | undefined,
      options: HandlerOptions | undefined,
      callback?: HandlerCallback,
    ): Promise<ActionResult> => {
      const text =
        typeof message.content === "string"
          ? message.content
          : message.content?.text;
      const intent =
        resolveRepositoryIntentFromParams(options?.parameters) ??
        (text ? resolveRepositoryIntentFromText(text) : undefined);
      let response = "";

      if (intent) {
        response = await executeRepositoryIntent(runtime, services, intent);
      } else {
        response =
          "I can inspect repository status, diffs, or recent commits. Try `/repo status` or ask `what changed in this repo?`.";
      }

      await callback?.({ text: response, source: "repository-action" });
      return { success: Boolean(intent), text: response };
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
  };
}
