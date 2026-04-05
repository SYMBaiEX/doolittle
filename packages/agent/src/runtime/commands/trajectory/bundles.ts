import type { AgentExecutionContext } from "../../chat";
import {
  resolveTrajectoryManifestPath,
  type TrajectoryBundleLike,
} from "./shared";

export function renderCompressedBundle(
  context: AgentExecutionContext,
  raw: string,
): string {
  if (raw === "latest") {
    const compressed = context.services.trajectories.compressLatest();
    return compressed
      ? JSON.stringify(compressed, null, 2)
      : "No trajectory bundles recorded.";
  }

  const bundles = context.services.trajectories.listBundles(
    50,
  ) as TrajectoryBundleLike[];
  const manifestPath = resolveTrajectoryManifestPath(raw, bundles);
  if (!manifestPath) {
    return `Trajectory bundle not found: ${raw}`;
  }
  const compressed = context.services.trajectories.compressBundle(manifestPath);
  if (!compressed) {
    return `Trajectory bundle could not be compressed: ${raw}`;
  }
  return JSON.stringify(compressed, null, 2);
}

export function renderReplayBundle(
  context: AgentExecutionContext,
  raw: string,
): string {
  if (raw === "latest") {
    const replay = context.services.trajectories.replayLatest();
    return replay
      ? JSON.stringify(replay, null, 2)
      : "No trajectory bundles recorded.";
  }

  const bundles = context.services.trajectories.listBundles(
    50,
  ) as TrajectoryBundleLike[];
  const manifestPath = resolveTrajectoryManifestPath(raw, bundles);
  if (!manifestPath) {
    return `Trajectory bundle not found: ${raw}`;
  }
  const replay = context.services.trajectories.replayBundle(manifestPath);
  if (!replay) {
    return `Trajectory bundle could not be replayed: ${raw}`;
  }
  return JSON.stringify(replay, null, 2);
}
