import { fuzzyMatch } from "./matching";
import type { FuzzyPatchOptions, PatchOperation, PatchResult } from "./types";

export interface OperationResult {
  lines: string[];
  applied: boolean;
  error?: string;
}

export function applyOperation(
  lines: string[],
  op: PatchOperation,
  opts: Required<FuzzyPatchOptions>,
): OperationResult {
  const searchLines = op.search;
  if (!searchLines.length) {
    return { lines: [...lines, ...op.replace], applied: true };
  }

  const required = Math.ceil(searchLines.length * opts.contextMatchRatio);

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
      return {
        lines: [
          ...lines.slice(0, start),
          ...op.replace,
          ...lines.slice(start + searchLines.length),
        ],
        applied: true,
      };
    }
  }

  return {
    lines,
    applied: false,
    error: `Could not locate search block starting with: "${searchLines[0]?.slice(0, 80)}"`,
  };
}

export function applyOperationsToLines(
  original: string,
  ops: PatchOperation[],
  options: Required<FuzzyPatchOptions>,
): Omit<PatchResult, "report" | "content" | "success"> & {
  content: string;
  reportLines: string[];
  success: boolean;
} {
  let lines = original.split("\n");
  let appliedHunks = 0;
  const errors: string[] = [];
  const reportLines: string[] = [];

  for (let i = 0; i < ops.length; i++) {
    const operation = ops[i];
    if (!operation) {
      continue;
    }
    const result = applyOperation(lines, operation, options);
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

  return {
    appliedHunks,
    failedHunks,
    errors,
    content,
    reportLines,
    success,
  };
}
