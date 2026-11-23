import type { TrajectoryResearchPackageBundle } from "../../../types/trajectory";
import { normalizeEvaluationMode } from "../evaluation-heuristics";
import { writeTrajectoryResearchPackageArtifacts } from "../evaluation-persistence";
import { evaluateBundle } from "./evaluate-bundle";
import { resolveTrajectoryEvaluationInput } from "./shared";
import type {
  PackageTrajectoryOptions,
  TrajectoryEvaluationHost,
} from "./types";

export async function packageBundle(
  host: TrajectoryEvaluationHost,
  options: PackageTrajectoryOptions = {},
): Promise<TrajectoryResearchPackageBundle> {
  const saved = options.manifestPath
    ? resolveTrajectoryEvaluationInput(host, options.manifestPath, options)
    : undefined;
  const analysis = saved
    ? {
        ...saved,
        mode: saved.focus,
        tags: saved.reportTags,
      }
    : host.analyze({
        ...options,
        limit: options.limit ?? 200,
        mode: options.mode ?? "research",
        purpose: options.purpose ?? "trajectory research package",
      });
  const evaluation = await evaluateBundle(host, analysis.bundle.manifestPath, {
    ...options,
    replay: analysis.replay,
    prompt: analysis.prompt,
    highlights: analysis.highlights,
    mode: normalizeEvaluationMode(options.mode ?? analysis.mode),
    purpose:
      analysis.purpose ?? options.purpose ?? "trajectory research package",
    tags: options.tags ?? analysis.tags,
    rubric: options.rubric,
  });
  const response = evaluation.response ?? evaluation.reportPath;
  const { packageManifestPath, reportPath, responsePath } =
    writeTrajectoryResearchPackageArtifacts({
      baseDir: host.baseDir,
      slug: host.slug,
      analysis,
      evaluation,
      response,
      purpose:
        analysis.purpose ?? options.purpose ?? "trajectory research package",
      mode: analysis.mode ?? options.mode ?? "research",
    });

  return {
    focus: evaluation.focus,
    bundle: analysis.bundle,
    replay: analysis.replay,
    analysis,
    evaluation,
    packageManifestPath,
    reportPath,
    response,
    responsePath,
    purpose: analysis.purpose,
    mode: analysis.mode,
    tags: analysis.tags,
  };
}

export async function packageLatest(
  host: TrajectoryEvaluationHost,
): Promise<TrajectoryResearchPackageBundle | undefined> {
  const latest = host.listBundles(1)[0];
  if (!latest) {
    return undefined;
  }
  return packageBundle(host, {
    manifestPath: latest.manifestPath,
  });
}
