import type { TrajectoryBenchmarkEnvironmentSummary } from "../../../types/trajectory";
import type { TrajectoryBenchmarkHost } from "./types";

export function describeTrajectoryBenchmarkEnvironment(
  host: TrajectoryBenchmarkHost,
): TrajectoryBenchmarkEnvironmentSummary {
  const latestBundle = host.listBundles(1)[0];
  const context = host.getModelContext?.();
  return {
    provider: context?.provider ?? "offline",
    model: context?.model ?? "offline",
    baseUrl: context?.baseUrl ?? "",
    temperature: context?.temperature ?? 0,
    maxTokens: context?.maxTokens ?? 0,
    bundleCount: host.listBundles(100).length,
    latestBundleLabel: latestBundle?.label,
    latestBundleCreatedAt: latestBundle?.createdAt,
    canEvaluate: true,
    canPackage: true,
  };
}
