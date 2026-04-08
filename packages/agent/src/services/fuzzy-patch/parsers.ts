import type { PatchOperation } from "./types";

interface Hunk {
  header: string;
  /** Lines prefixed with ' ' (context), '-' (remove), '+' (add). */
  lines: string[];
}

export function parseUnifiedDiff(patch: string): PatchOperation[] {
  const hunks: Hunk[] = [];
  let current: Hunk | null = null;

  for (const raw of patch.split("\n")) {
    if (raw.startsWith("@@")) {
      if (current) hunks.push(current);
      current = { header: raw, lines: [] };
    } else if (current) {
      current.lines.push(raw);
    }
  }
  if (current) hunks.push(current);

  return hunks.map((hunk) => {
    const search: string[] = [];
    const replace: string[] = [];
    void hunk.header;
    for (const line of hunk.lines) {
      if (line.startsWith("-")) {
        search.push(line.slice(1));
      } else if (line.startsWith("+")) {
        replace.push(line.slice(1));
      } else if (line.startsWith(" ")) {
        search.push(line.slice(1));
        replace.push(line.slice(1));
      }
    }
    return { search, replace };
  });
}

export function parseSearchReplaceBlocks(patch: string): PatchOperation[] {
  const ops: PatchOperation[] = [];
  const blockRe =
    /<<<+\s*SEARCH\s*\n([\s\S]*?)\n?={3,}\n([\s\S]*?)\n?>>>+\s*REPLACE/gi;
  for (const match of patch.matchAll(blockRe)) {
    ops.push({
      search: (match[1] ?? "").split("\n"),
      replace: (match[2] ?? "").split("\n"),
    });
  }
  return ops;
}

export function parsePatchOperations(patch: string): PatchOperation[] {
  if (patch.trimStart().startsWith("[")) {
    try {
      const parsed = JSON.parse(patch) as unknown;
      if (
        Array.isArray(parsed) &&
        parsed.every(
          (p) =>
            typeof p === "object" &&
            p !== null &&
            Array.isArray((p as PatchOperation).search) &&
            Array.isArray((p as PatchOperation).replace),
        )
      ) {
        return parsed as PatchOperation[];
      }
    } catch {
      // Fall through.
    }
  }

  if (/<<<+\s*SEARCH/i.test(patch)) {
    return parseSearchReplaceBlocks(patch);
  }

  if (patch.includes("@@")) {
    return parseUnifiedDiff(patch);
  }

  return [];
}
