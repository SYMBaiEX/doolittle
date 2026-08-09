import { webSearch } from "@elizaos/agent/runtime/actions/web-search";
import type {
  Action,
  ActionParameters,
  ActionResult,
  HandlerOptions,
  JsonValue,
  Memory,
  ShortcutDefinition,
} from "@elizaos/core";
import { getMemoryText } from "@elizaos/core";

function messageText(message: Memory): string {
  const content = message.content;
  if (typeof content === "string") return content;
  return content && typeof content === "object" ? getMemoryText(message) : "";
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

type WebSearchResult = {
  title?: unknown;
  url?: unknown;
  excerpt?: unknown;
  excerpts?: unknown;
  snippet?: unknown;
};

function readJsonStringProperty(
  input: string,
  property: string,
  fromIndex: number,
  allowTruncated = false,
): { value: string; end: number } | undefined {
  const marker = `"${property}"`;
  const propertyIndex = input.indexOf(marker, fromIndex);
  if (propertyIndex < 0) return undefined;
  const colonIndex = input.indexOf(":", propertyIndex + marker.length);
  if (colonIndex < 0) return undefined;
  const quoteIndex = input.indexOf('"', colonIndex + 1);
  if (quoteIndex < 0) return undefined;

  let escaped = false;
  for (let index = quoteIndex + 1; index < input.length; index += 1) {
    const character = input[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character !== '"') continue;
    try {
      return {
        value: JSON.parse(input.slice(quoteIndex, index + 1)) as string,
        end: index + 1,
      };
    } catch {
      return undefined;
    }
  }

  if (!allowTruncated) return undefined;
  const partial = input
    .slice(quoteIndex + 1)
    .replace(/\\u[0-9a-fA-F]{0,3}$/, "")
    .replace(/\\$/, "");
  try {
    return {
      value: JSON.parse(`"${partial.replace(/"/g, '\\"')}"`) as string,
      end: input.length,
    };
  } catch {
    return {
      value: partial
        .replaceAll("\\n", "\n")
        .replaceAll('\\"', '"')
        .replaceAll("\\\\", "\\"),
      end: input.length,
    };
  }
}

/**
 * The bundled SDK intentionally caps the search payload before returning it.
 * A long first excerpt can therefore cut the JSON document mid-string. Recover
 * complete URL/title fields and the available excerpt prefix instead of
 * discarding an otherwise successful search result.
 */
function recoverTruncatedSearchResults(input: string): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  let cursor = input.indexOf('"results"');
  if (cursor < 0) return results;

  while (results.length < 5) {
    const url = readJsonStringProperty(input, "url", cursor);
    if (!url) break;
    const title = readJsonStringProperty(input, "title", url.end);
    const nextUrlIndex = input.indexOf('"url"', url.end);
    const excerptMarker = input.indexOf('"excerpts"', title?.end ?? url.end);
    const excerpt =
      excerptMarker >= 0 && (nextUrlIndex < 0 || excerptMarker < nextUrlIndex)
        ? readJsonStringProperty(input, "excerpts", excerptMarker, true)
        : undefined;
    results.push({
      url: url.value,
      title: title?.value,
      excerpts: excerpt?.value ? [excerpt.value] : undefined,
    });
    cursor = nextUrlIndex;
    if (cursor < 0) break;
  }

  return results;
}

function cleanSearchText(value: string, maxChars: number): string {
  const clean = value
    .replace(/<[^>]*>/g, " ")
    .replace(/[`*_>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars - 1).trimEnd()}…`;
}

function safeResultUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function webSearchFallbackText(
  query: string,
  result: ActionResult,
): string | undefined {
  if (!result.success || typeof result.text !== "string") return undefined;
  let parsedResults: unknown[] | undefined;
  try {
    const parsed = JSON.parse(result.text) as { results?: unknown };
    if (Array.isArray(parsed.results)) {
      parsedResults = parsed.results;
    }
  } catch {
    parsedResults = recoverTruncatedSearchResults(result.text);
  }
  if (!parsedResults?.length) return undefined;
  const rows = parsedResults.slice(0, 5).flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return [];
    const item = candidate as WebSearchResult;
    const url = safeResultUrl(item.url);
    const rawTitle =
      typeof item.title === "string"
        ? item.title
        : url
          ? new URL(url).hostname
          : `Result ${index + 1}`;
    const title = cleanSearchText(rawTitle, 120).replaceAll("]", "\\]");
    const rawExcerpt = Array.isArray(item.excerpts)
      ? (item.excerpts.find(
          (excerpt): excerpt is string => typeof excerpt === "string",
        ) ?? "")
      : typeof item.excerpt === "string"
        ? item.excerpt
        : typeof item.snippet === "string"
          ? item.snippet
          : "";
    const excerpt = cleanSearchText(rawExcerpt, 320);
    const heading = url
      ? `${index + 1}. [${title}](${url})`
      : `${index + 1}. ${title}`;
    return [`${heading}${excerpt ? `\n   ${excerpt}` : ""}`];
  });
  if (rows.length === 0) return undefined;
  return `### Web results for “${cleanSearchText(query, 160)}”\n\n${rows.join("\n\n")}`;
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
      const result = await sourceAction.handler(
        runtime,
        message,
        state,
        normalizedOptions,
        callback
          ? (content) => callback(content, sourceAction.name)
          : undefined,
        responses,
      );
      const fallback = result
        ? webSearchFallbackText(query ?? messageText(message), result)
        : undefined;
      if (!result || !fallback || result.userFacingText) return result;
      return {
        ...result,
        userFacingText: fallback,
        verifiedUserFacing: true,
      };
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
    id: "doolittle-research-command",
    kind: "explicit",
    aliases: ["/research"],
    target: { kind: "action", name: "DOOLITTLE_RESEARCH" },
    requiresAction: "DOOLITTLE_RESEARCH",
    priority: 100,
  },
];
