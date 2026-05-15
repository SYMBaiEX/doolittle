import { join } from "node:path";
import { getNativeServices } from "@/runtime/native/service-bridge/runtime";
import {
  formatSdkTrajectoryExportReceipt,
  resolveNativeSdkTrajectoryLogger,
  writeSdkTrajectoryExport,
} from "@/services/trajectory/sdk-native";
import type { AgentExecutionContext } from "../../chat";
import {
  formatTrajectoryBundleList,
  parseTrajectoryArgs,
  type TrajectoryBundleLike,
} from "./shared";

const SDK_EXPORT_UNAVAILABLE =
  "ElizaOS SDK trajectory export unavailable. Doolittle debug bundles are not model-training trajectories; start the runtime with the ElizaOS trajectories service enabled, then run /trajectories export again.";

export async function handleTrajectoryExportCommands(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed === "/trajectories export") {
    const sdkExport = formatSdkTrajectoryExportReceipt(
      await writeSdkTrajectoryExport({
        runtime: context.runtime,
        outputDir: join(context.config.dataDir, "trajectories"),
        options: {
          format: "json",
          includePrompts: true,
        },
      }),
    );
    if (sdkExport) {
      return sdkExport;
    }
    return SDK_EXPORT_UNAVAILABLE;
  }

  if (trimmed.startsWith("/trajectories export ")) {
    const options = parseTrajectoryArgs(
      trimmed.replace("/trajectories export ", ""),
    );
    return (
      formatSdkTrajectoryExportReceipt(
        await writeSdkTrajectoryExport({
          runtime: context.runtime,
          outputDir: join(context.config.dataDir, "trajectories"),
          options: {
            format: "json",
            includePrompts: true,
            startDate: options.startDate,
            endDate: options.endDate,
            scenarioId: options.scenarioId,
            batchId: options.batchId,
          },
        }),
      ) ?? SDK_EXPORT_UNAVAILABLE
    );
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

  if (
    trimmed === "/trajectories list" ||
    trimmed.startsWith("/trajectories list ")
  ) {
    const options: ReturnType<typeof parseTrajectoryArgs> =
      trimmed === "/trajectories list"
        ? {}
        : parseTrajectoryArgs(trimmed.replace("/trajectories list ", ""));
    const nativeTrajectory = resolveNativeSdkTrajectoryLogger(context.runtime);
    const bundles =
      typeof nativeTrajectory?.listTrajectories === "function"
        ? await nativeTrajectory.listTrajectories({
            limit: options.limit ?? 10,
            source: options.source,
            status: options.status,
            search: options.search,
            startDate: options.startDate,
            endDate: options.endDate,
            scenarioId: options.scenarioId,
            batchId: options.batchId,
            isTrainingData: options.isTrainingData,
          })
        : undefined;
    if (bundles && "trajectories" in bundles) {
      return formatTrajectoryBundleList(
        bundles.trajectories.map<TrajectoryBundleLike>((trajectory) => ({
          manifestPath: `elizaos-sdk:${trajectory.id}`,
          label: trajectory.id,
          createdAt: trajectory.createdAt,
          messageCount: trajectory.llmCallCount,
          sessionCount: 1,
          trainingCompatible: true,
          trainingFormat: "elizaos-sdk",
          trainingNotes: "Canonical ElizaOS SDK trajectory.",
          dataPath: `elizaos-sdk:${trajectory.id}`,
          filters: {
            sessionId:
              typeof trajectory.metadata?.roomId === "string"
                ? trajectory.metadata.roomId
                : null,
            role: null,
          },
        })),
      );
    }
    const legacyNativeBundles = getNativeServices(
      context.runtime,
    ).trajectoryLogger?.bundles?.() as TrajectoryBundleLike[] | undefined;
    const fallbackBundles =
      legacyNativeBundles ??
      (context.services.trajectories.listBundles(
        options.limit ?? 10,
      ) as TrajectoryBundleLike[]);
    return formatTrajectoryBundleList(fallbackBundles);
  }

  return undefined;
}
