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

export function createSessionSearchAction(services: AppServices, limit: number): Action {
  return {
    name: "ELIZA_AGENT_SESSION_SEARCH",
    similes: ["SEARCH_SESSIONS", "LOOK_UP_HISTORY"],
    description: "Searches persisted conversation history with `/search <query>`.",
    validate: async (_runtime: IAgentRuntime, message: Memory) => {
      const text = typeof message.content === "string" ? message.content : message.content?.text;
      return Boolean(text && text.trim().startsWith("/search "));
    },
    handler: async (
      _runtime: IAgentRuntime,
      message: Memory,
      _state: State | undefined,
      _options: HandlerOptions | undefined,
      callback?: HandlerCallback,
    ): Promise<ActionResult> => {
      const text = typeof message.content === "string" ? message.content : message.content?.text;
      const query = text?.replace("/search", "").trim() ?? "";
      const matches = services.sessions.search(query, limit);
      const response = matches.length
        ? matches
            .map(
              (match) =>
                `- [${match.createdAt}] (${match.role}) session=${match.sessionId}: ${match.text}`,
            )
            .join("\n")
        : "No prior session matches found.";

      await callback?.({ text: response, source: "session-search-action" });
      return { success: true, text: response };
    },
    examples: [
      [
        {
          name: "{{userName}}",
          content: { text: "/search bun typescript" },
        },
        {
          name: "{{agentName}}",
          content: {
            text: "- [2026-03-19T00:00:00.000Z] (user) session=abc: Remember that this repo uses Bun only.",
            actions: ["ELIZA_AGENT_SESSION_SEARCH"],
          },
        },
      ],
    ],
  };
}
