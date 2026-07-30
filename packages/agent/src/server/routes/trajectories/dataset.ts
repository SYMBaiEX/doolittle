import { join } from "node:path";
import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";
import { writeSdkTrajectoryExport } from "@/services/trajectory/sdk-native";
import { buildTrajectoryRequest, readJsonBody } from "./helpers";
import type { TrajectoryDatasetBody, TrajectoryRouteHandler } from "./types";

export const handleTrajectoryDatasetRoutes: TrajectoryRouteHandler = async (
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> => {
  if (request.method === "POST" && url.pathname === "/trajectories/export") {
    const body = await readJsonBody<TrajectoryDatasetBody>(request);
    const sdkExport = await writeSdkTrajectoryExport({
      runtime: context.runtime,
      outputDir: join(context.config.dataDir, "trajectories"),
      options: {
        format: "json",
        includePrompts: true,
        startDate: body?.startDate,
        endDate: body?.endDate,
        scenarioId: body?.scenarioId,
        batchId: body?.batchId,
      },
    });
    if (sdkExport) {
      return json({
        path: sdkExport.path,
        export: sdkExport,
      });
    }
    return json(
      {
        error: "ElizaOS SDK trajectory export unavailable",
        detail:
          "Doolittle debug bundles are not model-training trajectories. Enable the ElizaOS trajectories service before exporting training data.",
        trainingCompatible: false,
        expectedTrainingSource: "elizaos-sdk",
      },
      503,
    );
  }

  if (request.method === "POST" && url.pathname === "/trajectories/bundle") {
    const body = await readJsonBody<TrajectoryDatasetBody>(request);
    return json(
      context.services.trajectoryEvaluation.exportFilteredBundle(
        buildTrajectoryRequest(body ?? {}),
      ),
    );
  }

  if (request.method === "POST" && url.pathname === "/trajectories/analyze") {
    const body = await readJsonBody<TrajectoryDatasetBody>(request);
    return json({
      analysis: context.services.trajectoryEvaluation.analyze(
        buildTrajectoryRequest(body ?? {}),
      ),
    });
  }

  if (request.method === "GET" && url.pathname === "/trajectories/bundles") {
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : 20;
    return json({
      bundles: context.services.trajectoryEvaluation.listBundles(
        !Number.isNaN(limit) && limit > 0 ? limit : 20,
      ),
    });
  }

  return null;
};
