import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

export type WorkspaceIntent =
  | { kind: "tree" }
  | { kind: "overview"; path?: string }
  | { kind: "read"; path: string }
  | { kind: "search"; query: string }
  | { kind: "write"; path: string; content: string }
  | { kind: "find-codebase"; query: string };

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeQuotedSegment(value: string): string | undefined {
  const fenced = value.match(/`([^`\n]+)`/u);
  if (fenced?.[1]?.trim()) {
    return fenced[1].trim();
  }
  const quoted = value.match(/"([^"\n]+)"|'([^'\n]+)'/u);
  const candidate = quoted?.[1] ?? quoted?.[2];
  return candidate?.trim() || undefined;
}

function extractExplicitProjectPath(text: string): string | undefined {
  const quoted = normalizeQuotedSegment(text);
  if (quoted && /^(~|\/|\.{1,2}\/|(?:dev|code|projects)\/)/u.test(quoted)) {
    return quoted;
  }

  const locatedPath =
    text.match(
      /(?:located|living|sitting)\s+(?:at|in|under)\s+((?:~|\/|\.{1,2}\/|(?:dev|code|projects)\/)[^\s,;:!?]+)/iu,
    )?.[1] ??
    text.match(
      /\b((?:~|\/|\.{1,2}\/|(?:dev|code|projects)\/)[A-Za-z0-9._/-]+)/u,
    )?.[1];
  return locatedPath?.trim() || undefined;
}

function extractNamedLocalCodebase(text: string): string | undefined {
  const explicitPath = extractExplicitProjectPath(text);
  if (explicitPath) {
    return explicitPath;
  }

  const patterns = [
    /(?:review|inspect|analy[sz]e|breakdown|summari[sz]e|overview|look at|open|check|scan)\s+(?:the\s+)?([a-zA-Z0-9._/-]+)\s+(?:repo|repository|project|codebase|folder|directory)\b/iu,
    /(?:the\s+)?([a-zA-Z0-9._/-]+)\s+(?:repo|repository|project|codebase|folder|directory)\b.*\b(?:locally|local|on my mac|on this machine|on my computer)\b/iu,
  ];

  for (const pattern of patterns) {
    const candidate = text.match(pattern)?.[1]?.trim();
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

export function resolveLocalProjectPath(
  inputPath: string,
  workspaceDir: string,
): string | undefined {
  const trimmed = inputPath.trim();
  if (!trimmed) {
    return undefined;
  }
  const home = process.env.HOME ?? workspaceDir;
  const expanded = trimmed.startsWith("~/")
    ? join(home, trimmed.slice(2))
    : trimmed;
  const resolved = isAbsolute(expanded)
    ? resolve(expanded)
    : /^(dev|code|projects)\//u.test(expanded)
      ? resolve(home, expanded)
      : resolve(workspaceDir, expanded);
  return existsSync(resolved) ? resolved : undefined;
}

export function resolveWorkspaceIntentFromParams(
  params: unknown,
): WorkspaceIntent | undefined {
  if (!params || typeof params !== "object") {
    return undefined;
  }
  const record = params as Record<string, unknown>;
  const rawKind =
    nonEmptyString(record.intent) ??
    nonEmptyString(record.action) ??
    nonEmptyString(record.mode);

  if (rawKind === "tree") {
    return { kind: "tree" };
  }
  if (rawKind === "overview") {
    const path =
      nonEmptyString(record.path) ??
      nonEmptyString(record.target) ??
      nonEmptyString(record.project);
    return { kind: "overview", path };
  }
  if (rawKind === "read") {
    const path =
      nonEmptyString(record.path) ??
      nonEmptyString(record.file) ??
      nonEmptyString(record.target);
    return path ? { kind: "read", path } : undefined;
  }
  if (rawKind === "search") {
    const query =
      nonEmptyString(record.query) ??
      nonEmptyString(record.term) ??
      nonEmptyString(record.pattern);
    return query ? { kind: "search", query } : undefined;
  }
  if (rawKind === "write") {
    const path =
      nonEmptyString(record.path) ??
      nonEmptyString(record.file) ??
      nonEmptyString(record.target);
    const content =
      nonEmptyString(record.content) ?? nonEmptyString(record.text);
    return path && content ? { kind: "write", path, content } : undefined;
  }
  if (rawKind === "find-codebase") {
    const query =
      nonEmptyString(record.query) ??
      nonEmptyString(record.name) ??
      nonEmptyString(record.term);
    return query ? { kind: "find-codebase", query } : undefined;
  }
  return undefined;
}

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

export function sanitizeFindQuery(value: string): string {
  return value.replace(/[^a-zA-Z0-9._/\- ]/gu, "").trim();
}
