import { webSearch } from "@elizaos/agent/runtime/actions/web-search";
import type {
  Action,
  ActionParameters,
  HandlerOptions,
  JsonValue,
  Memory,
  ShortcutDefinition,
} from "@elizaos/core";

const EXPLICIT_WEB_SEARCH_PREFIX = /^[/!]web(?:\s+|:\s*)?/iu;

function messageText(message: Memory): string {
  return typeof message.content === "string"
    ? message.content
    : (message.content?.text ?? "");
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
        : messageText(message).replace(EXPLICIT_WEB_SEARCH_PREFIX, "");
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
  {
    id: "doolittle-web-search-natural",
    kind: "natural",
    patterns: [
      {
        regex:
          /^(?<query>(?:do a )?(?:web|internet|online) search (?:for )?.+)$/iu,
        confidence: 0.99,
      },
      {
        regex:
          /^(?<query>search (?:the )?(?:web|internet|online) (?:for )?.+)$/iu,
        confidence: 0.99,
      },
      {
        regex: /^(?<query>look up .+ online)$/iu,
        confidence: 0.98,
      },
      {
        regex: /^(?<query>google .+)$/iu,
        confidence: 0.98,
      },
      {
        regex: /^(?<query>(?:current )?weather (?:in|for) .+)$/iu,
        confidence: 0.97,
      },
      {
        regex: /^(?<query>latest (?:news (?:about|on) |on ).+)$/iu,
        confidence: 0.97,
      },
    ],
    target: { kind: "action", name: "WEB_SEARCH" },
    requiresAction: "WEB_SEARCH",
    priority: 90,
  },
  {
    id: "doolittle-repository-natural",
    kind: "natural",
    patterns: [
      {
        regex:
          /^(?:(?:show|check) (?:the )?)?(?:git|repo|repository) status$/iu,
        confidence: 0.99,
      },
      {
        regex: /^(?:(?:show|check) (?:the )?)?(?:git|repo|repository) diff$/iu,
        confidence: 0.99,
      },
      {
        regex: /^(?:(?:show|check) (?:the )?)?(?:git|repo|repository) log$/iu,
        confidence: 0.99,
      },
      {
        regex: /^what changed in (?:this|the) (?:repo|repository|project)$/iu,
        confidence: 0.98,
      },
      {
        regex: /^(?:show )?(?:the )?recent commits$/iu,
        confidence: 0.98,
      },
    ],
    target: { kind: "action", name: "DOOLITTLE_REPOSITORY" },
    requiresAction: "DOOLITTLE_REPOSITORY",
    priority: 80,
  },
  {
    id: "doolittle-workspace-overview-natural",
    kind: "natural",
    patterns: [
      {
        regex:
          /^(?:what is|tell me about|give me an? overview of) (?:this|the) (?:repo|repository|project|codebase|workspace)$/iu,
        confidence: 0.99,
      },
      {
        regex:
          /^(?:review|inspect|analy[sz]e|explain|map out) (?:this|the) (?:repo|repository|project|codebase|workspace)(?: architecture)?$/iu,
        confidence: 0.99,
      },
      {
        regex:
          /^(?:review|inspect|analy[sz]e|explain) (?:this|the) (?:project|codebase|repository) architecture$/iu,
        confidence: 0.99,
      },
    ],
    target: { kind: "action", name: "DOOLITTLE_WORKSPACE" },
    requiresAction: "DOOLITTLE_WORKSPACE",
    priority: 95,
  },
  {
    id: "doolittle-workspace-search-natural",
    kind: "natural",
    patterns: [
      {
        regex:
          /^(?<query>search (?:this|the) (?:repo|repository|project|codebase|workspace) for .+)$/iu,
        confidence: 0.99,
      },
      {
        regex:
          /^(?<query>find .+ in (?:this|the) (?:repo|repository|project|codebase|workspace))$/iu,
        confidence: 0.99,
      },
    ],
    target: { kind: "action", name: "DOOLITTLE_WORKSPACE" },
    requiresAction: "DOOLITTLE_WORKSPACE",
    priority: 90,
  },
];
