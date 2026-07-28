import { webSearch } from "@elizaos/agent/runtime/actions/web-search";
import type {
  Action,
  ActionParameters,
  HandlerOptions,
  JsonValue,
  Memory,
  ShortcutDefinition,
} from "@elizaos/core";

function messageText(message: Memory): string {
  return typeof message.content === "string"
    ? message.content
    : (message.content?.text ?? "");
}

function explicitWebSearchQuery(text: string): string {
  const trimmed = text.trim();
  const normalized = trimmed.toLowerCase();
  for (const alias of ["/web", "!web"]) {
    if (normalized === alias) return "";
    if (
      normalized.startsWith(`${alias} `) ||
      normalized.startsWith(`${alias}:`)
    ) {
      const remainder = trimmed.slice(alias.length);
      return (
        remainder.startsWith(":") ? remainder.slice(1) : remainder
      ).trim();
    }
  }
  return trimmed;
}

function recordValue(
  value: HandlerOptions | Record<string, JsonValue | undefined> | undefined,
  key: string,
): unknown {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function resolveWebSearchQuery(
  message: Memory,
  options: HandlerOptions | Record<string, JsonValue | undefined> | undefined,
): string | undefined {
  const nestedParameters = recordValue(options, "parameters");
  const nestedQuery =
    nestedParameters && typeof nestedParameters === "object"
      ? (nestedParameters as Record<string, unknown>).query
      : undefined;
  const shortcutQuery = recordValue(options, "query");
  const candidate =
    typeof nestedQuery === "string"
      ? nestedQuery
      : typeof shortcutQuery === "string"
        ? shortcutQuery
        : explicitWebSearchQuery(messageText(message));
  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * The SDK shortcut gate supplies captured slots at the top level of
 * HandlerOptions, while planner-selected actions receive validated parameters
 * under `options.parameters`. Normalize the two official execution paths at
 * the plugin boundary so the bundled WEB_SEARCH action works unchanged in
 * both.
 */
export function createShortcutCompatibleWebSearchAction(
  sourceAction: Action = webSearch,
): Action {
  return {
    ...sourceAction,
    handler: async (runtime, message, state, options, callback, responses) => {
      const query = resolveWebSearchQuery(message, options);
      const existingParameters = recordValue(options, "parameters");
      const parameters: ActionParameters = {
        ...(existingParameters && typeof existingParameters === "object"
          ? (existingParameters as ActionParameters)
          : {}),
        ...(query ? { query } : {}),
      };
      const normalizedOptions: HandlerOptions = {
        ...(options ?? {}),
        parameters,
      };
      return sourceAction.handler(
        runtime,
        message,
        state,
        normalizedOptions,
        callback,
        responses,
      );
    },
  };
}

export const DOOLITTLE_SDK_SHORTCUTS: ShortcutDefinition[] = [
  {
    id: "doolittle-web-search-command",
    kind: "explicit",
    aliases: ["/web", "!web"],
    target: { kind: "action", name: "WEB_SEARCH" },
    requiresAction: "WEB_SEARCH",
    priority: 100,
  },
];
