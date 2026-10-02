import { appendFileSync, chmodSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

export interface CodexModelCallMetric {
  provider: "codex";
  completed: boolean;
  providerDurationMs: number;
  firstTextMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

/**
 * Persist only provider timing and reported token counts for isolated evals.
 * The file is rooted in Doolittle's data directory and never contains prompts,
 * responses, tool arguments, account identifiers, or credentials.
 */
export function recordEvalCodexModelCall(metric: CodexModelCallMetric): void {
  if (process.env.DOOLITTLE_EVAL_CAPTURE_MODEL_USAGE !== "true") return;
  const dataDir = process.env.DOOLITTLE_DATA_DIR?.trim();
  if (!dataDir) return;

  try {
    const root = resolve(dataDir);
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const path = join(root, "eval-model-calls.jsonl");
    appendFileSync(path, `${JSON.stringify(metric)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    chmodSync(path, 0o600);
  } catch {
    // Measurement must never change provider success, failure, or cancellation.
  }
}
