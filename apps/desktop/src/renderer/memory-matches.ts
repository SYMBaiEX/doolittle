export interface SavedProfileMatch {
  kind: string;
  value: string;
}

export interface MemoryMatchSnapshot {
  count: number;
  source: "saved-profile-recall";
}

export interface RecallResult {
  query: string;
  matches: SavedProfileMatch[];
  status: "ready" | "loading" | "idle" | "error";
}

/** Backwards-compatible representation of the profile-recall route payload. */
export interface MemoryMatchesResponse {
  hits?: unknown;
}

const MAX_MATCHES = 3;
const MAX_MATCH_VALUE_LENGTH = 160;
export const MIN_MEMORY_MATCH_QUERY_LENGTH = 4;

function boundedText(value: unknown, maximum = MAX_MATCH_VALUE_LENGTH): string {
  if (typeof value !== "string") return "";
  const normalized = Array.from(value)
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127 ? " " : character;
    })
    .join("")
    .trim();
  if (!normalized) return "";
  return normalized.length > maximum
    ? `${normalized.slice(0, maximum - 1).trimEnd()}…`
    : normalized;
}

function boundedKind(value: unknown): string {
  const normalized = boundedText(value, 32).toLowerCase();
  return /^[a-z][a-z-]*$/u.test(normalized) ? normalized : "saved detail";
}

export function normalizeSavedProfileMatches(
  response: { hits?: unknown } | null | undefined,
): SavedProfileMatch[] {
  if (!Array.isArray(response?.hits)) return [];

  const seen = new Set<string>();
  const matches: SavedProfileMatch[] = [];
  for (const hit of response.hits) {
    if (!hit || typeof hit !== "object" || Array.isArray(hit)) continue;
    const record = hit as Record<string, unknown>;
    const value = boundedText(record.value);
    if (!value) continue;
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push({ kind: boundedKind(record.kind), value });
    if (matches.length === MAX_MATCHES) break;
  }
  return matches;
}

export function canRecallSavedProfileMatches(query: string): boolean {
  const normalized = query.trim();
  return (
    normalized.length >= MIN_MEMORY_MATCH_QUERY_LENGTH &&
    normalized.length <= 1_000
  );
}

export function freezeMemoryMatchSnapshot(
  query: string,
  recall: RecallResult,
): MemoryMatchSnapshot | undefined;

export function freezeMemoryMatchSnapshot(
  query: string,
  recalledQuery: string,
  matches: SavedProfileMatch[],
): MemoryMatchSnapshot | undefined;

export function freezeMemoryMatchSnapshot(
  query: string,
  recallOrQuery: RecallResult | string,
  legacyMatches?: SavedProfileMatch[],
): MemoryMatchSnapshot | undefined {
  const recall: RecallResult =
    typeof recallOrQuery === "string"
      ? {
          query: recallOrQuery,
          matches: legacyMatches ?? [],
          status: "ready",
        }
      : recallOrQuery;
  if (recall.status !== "ready" || query.trim() !== recall.query.trim()) {
    return undefined;
  }
  return { count: recall.matches.length, source: "saved-profile-recall" };
}
