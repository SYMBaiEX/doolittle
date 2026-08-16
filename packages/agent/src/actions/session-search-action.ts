import type {
  Action,
  ActionResult,
  HandlerCallback,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import { searchNativeSessions } from "@/runtime/native/service-bridge/tooling";
import {
  GLOBAL_SESSION_ACCESS_DENIED,
  hasGlobalSessionOperatorAccess,
} from "@/runtime/session-operator-policy";
import type { SessionSearchResult } from "@/types";
import { messageText } from "@/utils/eliza-compat";

function optionQuery(options: HandlerOptions | undefined): string | undefined {
  const parameters =
    options?.parameters && typeof options.parameters === "object"
      ? (options.parameters as Record<string, unknown>)
      : undefined;
  const query = parameters?.query;
  return typeof query === "string" && query.trim() ? query.trim() : undefined;
}

function explicitSearchQuery(message: Memory): string | undefined {
  const text = messageText(message).trim();
  if (!text.startsWith("/search ")) {
    return undefined;
  }
  const query = text.slice("/search ".length).trim();
  return query || undefined;
}

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

export function formatSessionSearchResults(
  matches: SessionSearchResult[],
): string {
  return matches.length
    ? matches
        .map(
          (match) =>
            `- [${match.createdAt}] (${match.role}) session=${match.sessionId}: ${match.text}`,
        )
        .join("\n")
    : "No prior session matches found.";
}

export function createSessionSearchAction(limit: number): Action {
  return {
    name: "DOOLITTLE_SESSION_SEARCH",
    similes: ["SEARCH_SESSIONS", "LOOK_UP_HISTORY"],
    description:
      "Searches persisted conversation history for a user-supplied query. Use this when the user asks to find or recall information from prior sessions.",
    descriptionCompressed: "Search persisted conversation history.",
    routingHint:
      "find or recall prior conversation content -> DOOLITTLE_SESSION_SEARCH",
    contexts: ["memory"],
    cacheStable: true,
    validate: async (_runtime, message) =>
      hasGlobalSessionOperatorAccess(messageSource(message)),
    handler: async (
      runtime: IAgentRuntime,
      message: Memory,
      _state: State | undefined,
      _options: HandlerOptions | undefined,
      callback?: HandlerCallback,
    ): Promise<ActionResult> => {
      if (!hasGlobalSessionOperatorAccess(messageSource(message))) {
        await callback?.({
          text: GLOBAL_SESSION_ACCESS_DENIED,
          source: "session-search-action",
        });
        return {
          success: false,
          text: GLOBAL_SESSION_ACCESS_DENIED,
          userFacingText: GLOBAL_SESSION_ACCESS_DENIED,
        };
      }
      const query = optionQuery(_options) ?? explicitSearchQuery(message);
      if (!query) {
        const usage =
          "Tell me what to search for in prior conversations, or use `/search <query>`.";
        await callback?.({ text: usage, source: "session-search-action" });
        return { success: false, text: usage, userFacingText: usage };
      }
      const matches = searchNativeSessions(runtime, query, limit);
      const response = formatSessionSearchResults(matches);

      await callback?.({ text: response, source: "session-search-action" });
      return {
        success: true,
        text: response,
        userFacingText: response,
        verifiedUserFacing: true,
        data: { query, matchCount: matches.length },
      };
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
            actions: ["DOOLITTLE_SESSION_SEARCH"],
          },
        },
      ],
    ],
    parameters: [
      {
        name: "query",
        description: "Natural-language query to search in prior conversations.",
        required: true,
        schema: { type: "string", minLength: 1 },
      },
    ],
  };
}
