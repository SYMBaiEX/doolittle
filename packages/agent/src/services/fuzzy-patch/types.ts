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
