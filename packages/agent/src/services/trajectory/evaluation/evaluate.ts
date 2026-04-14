import type {
  TrajectoryEvaluationBundle,
  TrajectoryExportOptions,
} from "../../../types/trajectory";
import { normalizeEvaluationMode } from "../evaluation-heuristics";
import { evaluateBundle } from "./evaluate-bundle";
import type { TrajectoryEvaluationHost } from "./types";

export async function evaluate(
  host: TrajectoryEvaluationHost,
  options: TrajectoryExportOptions = {},
): Promise<TrajectoryEvaluationBundle> {
  const focus = normalizeEvaluationMode(options.mode);
  const analysis = host.analyze({
    ...options,
    mode: focus,
    purpose: options.purpose ?? "trajectory evaluation",
  });
  return evaluateBundle(host, analysis.bundle.manifestPath, {
    ...options,
    replay: analysis.replay,
    prompt: analysis.prompt,
    highlights: analysis.highlights,
    mode: focus,
    purpose: analysis.purpose,
    tags: analysis.tags,
  });
}
