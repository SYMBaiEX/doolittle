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

export function createRepositoryAction(services: AppServices): Action {
  return {
    name: "ELIZA_AGENT_REPOSITORY",
    similes: ["REPO_STATUS", "REPO_DIFF", "REPO_LOG", "GIT_STATUS"],
    description:
      "Inspects repository state with `/repo status`, `/repo diff`, and `/repo log`.",
    validate: async (_runtime: IAgentRuntime, message: Memory) => {
      const text = typeof message.content === "string" ? message.content : message.content?.text;
      return Boolean(text && text.trim().startsWith("/repo"));
    },
    handler: async (
      _runtime: IAgentRuntime,
      message: Memory,
      _state: State | undefined,
      _options: HandlerOptions | undefined,
      callback?: HandlerCallback,
    ): Promise<ActionResult> => {
      const text = typeof message.content === "string" ? message.content : message.content?.text;
      const trimmed = text?.trim() ?? "";
      let response = "";

      if (trimmed === "/repo" || trimmed === "/repo status") {
        response = await services.repository.status();
      } else if (trimmed === "/repo diff") {
        response = await services.repository.diffStat();
      } else if (trimmed === "/repo log") {
        response = await services.repository.recentCommits();
      } else {
        response = "Usage: /repo status | /repo diff | /repo log";
      }

      await callback?.({ text: response, source: "repository-action" });
      return { success: true, text: response };
    },
  };
}
