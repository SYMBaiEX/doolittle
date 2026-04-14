import { getNativeServices } from "@/runtime/native/service-bridge/runtime";
import type { AgentExecutionContext } from "../../chat";
import {
  resolveTrajectoryManifestPath,
  type TrajectoryBundleLike,
} from "./shared";

export async function handleTrajectoryCompareCommands(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed === "/trajectories compare latest") {
    const nativeTrajectory = getNativeServices(
      context.runtime,
    ).trajectoryLogger;
    const comparison =
      typeof nativeTrajectory?.compareLatest === "function"
        ? nativeTrajectory.compareLatest()
        : context.services.trajectories.compareLatest();
    return comparison
      ? JSON.stringify(comparison, null, 2)
      : "At least two trajectory bundles are required for comparison.";
  }

  if (trimmed.startsWith("/trajectories compare ")) {
    const raw = trimmed.replace("/trajectories compare ", "").trim();
    const [leftRaw, rightRaw] = raw.split("::").map((part) => part.trim());
    if (!leftRaw || !rightRaw) {
      return "Usage: /trajectories compare <left-manifest|label> :: <right-manifest|label>";
    }
    const bundles = context.services.trajectories.listBundles(
      100,
    ) as TrajectoryBundleLike[];
    const leftManifestPath =
      resolveTrajectoryManifestPath(leftRaw, bundles) ?? leftRaw;
    const rightManifestPath =
      resolveTrajectoryManifestPath(rightRaw, bundles) ?? rightRaw;
    return JSON.stringify(
      context.services.trajectories.compareBundles(
        leftManifestPath,
        rightManifestPath,
      ),
      null,
      2,
    );
  }

  return undefined;
}
