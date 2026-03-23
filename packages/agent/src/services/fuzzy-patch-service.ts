/**
 * Fuzzy Patch Service
 *
 * Applies unified-diff-style patches to files using fuzzy (edit-distance)
 * line matching. Unlike exact-match patching, this tolerates:
 *   - Whitespace drift (trailing spaces, tab vs. space)
 *   - Minor edits to surrounding context lines since the model last saw them
 *   - Comment changes that don't affect the patch intent
 *
 * Inspired by Hermes Agent's `file_tools.py` fuzzy patch approach, ported
 * to TypeScript for the Eliza Agent's coding-agent workflows.
 *
 * Patch format supported:
 *   - Standard unified diff (@@ -L,C +L,C @@) blocks
 *   - Simple search/replace blocks (<<<SEARCH … ===DIVIDER … >>>REPLACE)
 *   - Line-oriented patches (array of `PatchOperation` objects)
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PatchOperation {
  /** Lines of context and removals that must be located in the file. */
  search: string[];
  /** Lines that should replace the matched block. */
  replace: string[];
}

export interface FuzzyPatchOptions {
  /**
   * Maximum edit distance per context line before rejecting a match.
   * Lower = stricter. Default: 4.
   */
  maxEditDistance?: number;
  /**
   * Fraction of context lines that must match for a hunk to be applied.
   * Default: 0.6 (60%).
   */
  contextMatchRatio?: number;
  /**
   * When true, write the patched file back to disk. Default: true.
   */
  write?: boolean;
  /**
   * When true, return a dry-run result without writing. Default: false.
   */
  dryRun?: boolean;
}

export interface PatchResult {
  success: boolean;
  /** Number of hunks that were successfully applied. */
  appliedHunks: number;
  /** Number of hunks that could not be located in the file. */
  failedHunks: number;
  /** The resulting file content (whether written or not). */
  content: string;
  /** Human-readable report of what happened. */
  report: string;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Edit-distance (Levenshtein) on strings
// ---------------------------------------------------------------------------

/**
 * Computes the Levenshtein edit distance between two strings.
 * O(m*n) time, O(min(m,n)) space.
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Work on the shorter string as the inner dimension
  const [s, t] = a.length <= b.length ? [a, b] : [b, a];

  let prev = Array.from({ length: s.length + 1 }, (_, i) => i);
  for (let j = 1; j <= t.length; j++) {
    const curr = [j];
    for (let i = 1; i <= s.length; i++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        prev[i] + 1, // deletion
        curr[i - 1] + 1, // insertion
        prev[i - 1] + cost, // substitution
      );
    }
    prev = curr;
  }
  return prev[s.length];
}

/**
 * Normalises a line for fuzzy comparison: trims trailing whitespace and
 * collapses internal runs of whitespace.
 */
function normalise(line: string): string {
  return line.trimEnd().replace(/\s+/g, " ");
}

/**
 * Returns true when `a` and `b` are within `maxDist` edit-distance of each
 * other after normalisation.
 */
function fuzzyMatch(a: string, b: string, maxDist: number): boolean {
  const na = normalise(a);
  const nb = normalise(b);
  if (na === nb) return true;
  if (Math.abs(na.length - nb.length) > maxDist * 2) return false;
  return editDistance(na, nb) <= maxDist;
}

// ---------------------------------------------------------------------------
// Unified diff parser
// ---------------------------------------------------------------------------

interface Hunk {
  header: string;
  /** Lines prefixed with ' ' (context), '-' (remove), '+' (add). */
  lines: string[];
}

function parseUnifiedDiff(patch: string): PatchOperation[] {
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
    for (const line of hunk.lines) {
      if (line.startsWith("-")) {
        search.push(line.slice(1));
      } else if (line.startsWith("+")) {
        replace.push(line.slice(1));
      } else if (line.startsWith(" ")) {
        // Context line – appears in both
        search.push(line.slice(1));
        replace.push(line.slice(1));
      }
    }
    return { search, replace };
  });
}

// ---------------------------------------------------------------------------
// Search/replace block parser  (<<<SEARCH … === … >>>REPLACE)
// ---------------------------------------------------------------------------

function parseSearchReplaceBlocks(patch: string): PatchOperation[] {
  const ops: PatchOperation[] = [];
  // Support multiple common delimiters
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

// ---------------------------------------------------------------------------
// Core fuzzy application engine
// ---------------------------------------------------------------------------

function applyOperation(
  lines: string[],
  op: PatchOperation,
  opts: Required<FuzzyPatchOptions>,
): { lines: string[]; applied: boolean; error?: string } {
  const searchLines = op.search;
  if (!searchLines.length) {
    // Empty search = append at end
    return { lines: [...lines, ...op.replace], applied: true };
  }

  const required = Math.ceil(searchLines.length * opts.contextMatchRatio);

  // Slide a window of searchLines.length across the file
  for (let start = 0; start <= lines.length - searchLines.length; start++) {
    const window = lines.slice(start, start + searchLines.length);
    let matched = 0;
    for (let i = 0; i < searchLines.length; i++) {
      if (
        fuzzyMatch(window[i] ?? "", searchLines[i] ?? "", opts.maxEditDistance)
      ) {
        matched++;
      }
    }
    if (matched >= required) {
      const result = [
        ...lines.slice(0, start),
        ...op.replace,
        ...lines.slice(start + searchLines.length),
      ];
      return { lines: result, applied: true };
    }
  }

  return {
    lines,
    applied: false,
    error: `Could not locate search block starting with: "${searchLines[0]?.slice(0, 80)}"`,
  };
}

// ---------------------------------------------------------------------------
// Public service class
// ---------------------------------------------------------------------------

export class FuzzyPatchService {
  private readonly defaults: Required<FuzzyPatchOptions>;

  constructor(defaults: FuzzyPatchOptions = {}) {
    this.defaults = {
      maxEditDistance: defaults.maxEditDistance ?? 4,
      contextMatchRatio: defaults.contextMatchRatio ?? 0.6,
      write: defaults.write !== false,
      dryRun: defaults.dryRun ?? false,
    };
  }

  // -------------------------------------------------------------------------
  // Apply a patch string (unified diff or search/replace) to a file
  // -------------------------------------------------------------------------

  /**
   * Apply a unified diff or search/replace patch to the file at `filePath`.
   */
  applyPatch(
    filePath: string,
    patch: string,
    options: FuzzyPatchOptions = {},
  ): PatchResult {
    if (!existsSync(filePath)) {
      return this.fail(`File not found: ${filePath}`);
    }

    const original = readFileSync(filePath, "utf8");
    const ops = this.parsePatch(patch);
    if (!ops.length) {
      return this.fail(
        "Could not parse any patch operations from the provided patch string.",
      );
    }

    return this.applyOperations(filePath, original, ops, options);
  }

  /**
   * Apply an array of `PatchOperation` objects to the file at `filePath`.
   */
  applyOperations(
    filePath: string,
    original: string,
    ops: PatchOperation[],
    options: FuzzyPatchOptions = {},
  ): PatchResult {
    const opts: Required<FuzzyPatchOptions> = {
      ...this.defaults,
      ...options,
    };

    let lines = original.split("\n");
    let appliedHunks = 0;
    const errors: string[] = [];
    const reportLines: string[] = [];

    for (let i = 0; i < ops.length; i++) {
      const operation = ops[i];
      if (!operation) {
        continue;
      }
      const result = applyOperation(lines, operation, opts);
      if (result.applied) {
        lines = result.lines;
        appliedHunks++;
        reportLines.push(`  Hunk ${i + 1}: applied`);
      } else {
        errors.push(result.error ?? `Hunk ${i + 1}: failed`);
        reportLines.push(`  Hunk ${i + 1}: FAILED — ${result.error}`);
      }
    }

    const content = lines.join("\n");
    const failedHunks = ops.length - appliedHunks;
    const success = appliedHunks > 0 && failedHunks === 0;

    if (!opts.dryRun && opts.write && appliedHunks > 0) {
      writeFileSync(filePath, content, "utf8");
    }

    const report = [
      `Patch result for ${filePath}:`,
      `  Applied: ${appliedHunks}/${ops.length} hunk(s)`,
      ...reportLines,
    ].join("\n");

    return { success, appliedHunks, failedHunks, content, report, errors };
  }

  // -------------------------------------------------------------------------
  // Apply a direct search/replace operation (no patch format needed)
  // -------------------------------------------------------------------------

  /**
   * Find `searchText` in the file (fuzzy match, line by line) and replace it
   * with `replaceText`. Useful for direct API usage from agent tools.
   */
  findAndReplace(
    filePath: string,
    searchText: string,
    replaceText: string,
    options: FuzzyPatchOptions = {},
  ): PatchResult {
    if (!existsSync(filePath)) {
      return this.fail(`File not found: ${filePath}`);
    }
    const original = readFileSync(filePath, "utf8");
    const op: PatchOperation = {
      search: searchText.split("\n"),
      replace: replaceText.split("\n"),
    };
    return this.applyOperations(filePath, original, [op], options);
  }

  // -------------------------------------------------------------------------
  // Content-based apply (no file path needed)
  // -------------------------------------------------------------------------

  /**
   * Apply operations to a string directly (no disk I/O).
   */
  applyToString(
    content: string,
    ops: PatchOperation[],
    options: FuzzyPatchOptions = {},
  ): {
    content: string;
    appliedHunks: number;
    failedHunks: number;
    errors: string[];
  } {
    const opts: Required<FuzzyPatchOptions> = {
      ...this.defaults,
      ...options,
      write: false,
    };

    let lines = content.split("\n");
    let appliedHunks = 0;
    const errors: string[] = [];

    for (const op of ops) {
      const result = applyOperation(lines, op, opts);
      if (result.applied) {
        lines = result.lines;
        appliedHunks++;
      } else {
        errors.push(result.error ?? "unknown error");
      }
    }

    return {
      content: lines.join("\n"),
      appliedHunks,
      failedHunks: ops.length - appliedHunks,
      errors,
    };
  }

  // -------------------------------------------------------------------------
  // Diff utilities
  // -------------------------------------------------------------------------

  /**
   * Generate a simple line-level diff between `original` and `updated`.
   * Returns a human-readable summary (not a standard unified diff).
   */
  describeDiff(original: string, updated: string): string {
    const origLines = original.split("\n");
    const updLines = updated.split("\n");
    const added = updLines.filter((l) => !origLines.includes(l)).length;
    const removed = origLines.filter((l) => !updLines.includes(l)).length;
    return `+${added} lines added, -${removed} lines removed (${origLines.length} → ${updLines.length} lines)`;
  }

  // -------------------------------------------------------------------------
  // Patch parser
  // -------------------------------------------------------------------------

  /**
   * Detects the patch format and returns `PatchOperation[]`.
   * Supports: unified diff, search/replace blocks, raw PatchOperation JSON.
   */
  parsePatch(patch: string): PatchOperation[] {
    // JSON array of PatchOperation
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
        // Fall through
      }
    }

    // Search/replace blocks (<<<SEARCH … >>>REPLACE)
    if (/<<<+\s*SEARCH/i.test(patch)) {
      return parseSearchReplaceBlocks(patch);
    }

    // Unified diff
    if (patch.includes("@@")) {
      return parseUnifiedDiff(patch);
    }

    // Fallback: treat the whole string as a single search block
    // where the first half is searched and second is replaced
    // (used for trivial single-replacement calls)
    return [];
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private fail(message: string): PatchResult {
    return {
      success: false,
      appliedHunks: 0,
      failedHunks: 0,
      content: "",
      report: message,
      errors: [message],
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton convenience export
// ---------------------------------------------------------------------------

export const fuzzyPatcher = new FuzzyPatchService();
