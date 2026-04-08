import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { applyOperationsToLines } from "./engine";
import { parsePatchOperations } from "./parsers";
import type { FuzzyPatchOptions, PatchOperation, PatchResult } from "./types";

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

    const result = applyOperationsToLines(original, ops, opts);

    if (!opts.dryRun && opts.write && result.appliedHunks > 0) {
      writeFileSync(filePath, result.content, "utf8");
    }

    const report = [
      `Patch result for ${filePath}:`,
      `  Applied: ${result.appliedHunks}/${ops.length} hunk(s)`,
      ...result.reportLines,
    ].join("\n");

    return {
      success: result.success,
      appliedHunks: result.appliedHunks,
      failedHunks: result.failedHunks,
      content: result.content,
      report,
      errors: result.errors,
    };
  }

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

    const result = applyOperationsToLines(content, ops, opts);
    return {
      content: result.content,
      appliedHunks: result.appliedHunks,
      failedHunks: result.failedHunks,
      errors: result.errors,
    };
  }

  describeDiff(original: string, updated: string): string {
    const origLines = original.split("\n");
    const updLines = updated.split("\n");
    const added = updLines.filter((l) => !origLines.includes(l)).length;
    const removed = origLines.filter((l) => !updLines.includes(l)).length;
    return `+${added} lines added, -${removed} lines removed (${origLines.length} → ${updLines.length} lines)`;
  }

  parsePatch(patch: string): PatchOperation[] {
    return parsePatchOperations(patch);
  }

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

export const fuzzyPatcher = new FuzzyPatchService();
