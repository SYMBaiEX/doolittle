import { normalizeQuotedSegment } from "./shared/string-helpers";

export function extractExplicitProjectPath(text: string): string | undefined {
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

export function extractNamedLocalCodebase(text: string): string | undefined {
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
