import {
  extractExplicitProjectPath,
  extractNamedLocalCodebase,
} from "../path-extraction";
import { normalizeQuotedSegment } from "../shared/string-helpers";
import type { WorkspaceIntent } from "../types";

export function resolveWorkspaceIntentFromText(
  text: string,
): WorkspaceIntent | undefined {
  const trimmed = text.trim();
  if (trimmed === "/workspace" || trimmed === "/workspace tree") {
    return { kind: "tree" };
  }
  if (trimmed.startsWith("/workspace read ")) {
    const path = trimmed.replace("/workspace read ", "").trim();
    return path ? { kind: "read", path } : undefined;
  }
  if (trimmed.startsWith("/workspace search ")) {
    const query = trimmed.replace("/workspace search ", "").trim();
    return query ? { kind: "search", query } : undefined;
  }
  if (trimmed.startsWith("/workspace write ")) {
    const payload = trimmed.replace("/workspace write ", "");
    const [path, ...contentParts] = payload.split("::");
    const relativePath = path?.trim();
    const content = contentParts.join("::").trim();
    return relativePath && content
      ? { kind: "write", path: relativePath, content }
      : undefined;
  }

  const lower = trimmed.toLowerCase();
  const explicitProjectPath = extractExplicitProjectPath(trimmed);
  const namedLocalCodebase = extractNamedLocalCodebase(trimmed);

  if (
    namedLocalCodebase &&
    /\b(locally|local|on my mac|on this machine|on my computer)\b/iu.test(
      trimmed,
    )
  ) {
    return { kind: "find-codebase", query: namedLocalCodebase };
  }
  if (
    /(workspace tree|show (?:me )?(?:the )?(?:repo|workspace) tree|list files|show files|show structure|project structure)/u.test(
      lower,
    )
  ) {
    return { kind: "tree" };
  }

  if (
    /(summari[sz]e|overview|what is|inspect|look at|breakdown|review|map out|research|where to start).*(repo|repository|project|codebase|workspace)/u.test(
      lower,
    ) ||
    /(repo|repository|project|codebase|workspace).*(summari[sz]e|overview|breakdown|review|map out|research|where to start)/u.test(
      lower,
    )
  ) {
    return explicitProjectPath
      ? { kind: "overview", path: explicitProjectPath }
      : { kind: "overview" };
  }

  if (
    /(read|open|show|cat|view).*(file|source|ts|js|json|md|tsx|jsx|py|rs|go|java)/iu.test(
      trimmed,
    )
  ) {
    const path =
      trimmed.match(
        /(?:read|open|show|cat|view)\s+(?:the\s+)?file\s+([^\n]+)$/iu,
      )?.[1] ?? normalizeQuotedSegment(trimmed);
    return path ? { kind: "read", path } : undefined;
  }

  if (
    explicitProjectPath &&
    /\b(repo|repository|project|codebase|directory|folder|overview|inspect|look at|what is)\b/iu.test(
      trimmed,
    )
  ) {
    return { kind: "find-codebase", query: explicitProjectPath };
  }

  if (
    /(search|find|look for).*(workspace|repo|repository|codebase|project|files?)/u.test(
      lower,
    )
  ) {
    const query =
      trimmed
        .match(
          /(?:search|find|look for)\s+(?:the\s+)?(?:workspace|repo|repository|codebase|project|files?)?\s*(?:for\s+)?([^\n]+)$/iu,
        )?.[1]
        ?.trim() ?? "";
    return query ? { kind: "search", query } : undefined;
  }

  const localCodebaseSearch =
    trimmed.match(
      /(?:search|find|look for)\s+(?:the\s+)?(?:local\s+system|machine|computer).*(?:codebase|repo|repository|project)(?:\s+(?:named|called))?\s+([^\n]+)$/iu,
    )?.[1] ??
    trimmed.match(
      /(?:search|find|look for)\s+(?:a\s+)?(?:codebase|repo|repository|project)(?:\s+(?:named|called))?\s+([^\n]+)\s+(?:on|in)\s+(?:the\s+)?(?:local\s+system|machine|computer)$/iu,
    )?.[1];
  if (localCodebaseSearch?.trim()) {
    return { kind: "find-codebase", query: localCodebaseSearch.trim() };
  }

  return undefined;
}
