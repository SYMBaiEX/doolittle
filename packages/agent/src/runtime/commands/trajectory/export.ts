import { getNativeServices } from "@/runtime/native/service-bridge/runtime";
import type { AgentExecutionContext } from "../../chat";
import {
  formatTrajectoryBundleList,
  parseTrajectoryArgs,
  type TrajectoryBundleLike,
} from "./shared";

export async function handleTrajectoryExportCommands(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed === "/trajectories export") {
    const nativeTrajectory = getNativeServices(
      context.runtime,
    ).trajectoryLogger;
    const nativeExport =
      typeof nativeTrajectory?.exportLatest === "function"
        ? nativeTrajectory.exportLatest()
        : undefined;
    return typeof nativeExport === "string"
      ? nativeExport
      : context.services.trajectories.exportRecent(200);
  }

  if (trimmed.startsWith("/trajectories export ")) {
    const options = parseTrajectoryArgs(
      trimmed.replace("/trajectories export ", ""),
    );
    return context.services.trajectories.exportDataset({
      ...options,
      limit: options.limit ?? 200,
      mode: options.mode ?? "dataset",
      purpose: options.purpose ?? "trajectory export",
    });
  }

  if (trimmed === "/trajectories bundle") {
    return JSON.stringify(
      context.services.trajectories.exportBundle(200),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/trajectories bundle ")) {
    const options = parseTrajectoryArgs(
      trimmed.replace("/trajectories bundle ", ""),
    );
    return JSON.stringify(
      context.services.trajectories.exportFilteredBundle({
        ...options,
        limit: options.limit ?? 200,
        mode: options.mode ?? "research",
        purpose: options.purpose ?? "trajectory research",
        tags: options.tags,
        notes: options.notes,
      }),
      null,
      2,
    );
  }

  if (trimmed === "/trajectories list") {
    const nativeTrajectory = getNativeServices(
      context.runtime,
    ).trajectoryLogger;
    const bundles =
      (typeof nativeTrajectory?.bundles === "function"
        ? (nativeTrajectory.bundles() as TrajectoryBundleLike[])
        : undefined) ??
      (context.services.trajectories.listBundles(10) as TrajectoryBundleLike[]);
    return formatTrajectoryBundleList(bundles);
  }

  return undefined;
}
