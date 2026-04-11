import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";
import {
  buildTrajectoryRequest,
  getTrajectoryLogger,
  readJsonBody,
} from "./helpers";
import type { TrajectoryDatasetBody, TrajectoryRouteHandler } from "./types";

export const handleTrajectoryDatasetRoutes: TrajectoryRouteHandler = async (
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> => {
  const nativeTrajectory = getTrajectoryLogger(context);

  if (request.method === "POST" && url.pathname === "/trajectories/export") {
    const body = await readJsonBody<TrajectoryDatasetBody>(request);
    return json({
      path:
        (typeof nativeTrajectory?.exportLatest === "function"
          ? nativeTrajectory.exportLatest()
          : undefined) ??
        context.services.trajectories.exportDataset(
          buildTrajectoryRequest(body ?? {}),
        ),
    });
  }

  if (request.method === "POST" && url.pathname === "/trajectories/bundle") {
    const body = await readJsonBody<TrajectoryDatasetBody>(request);
    return json(
      context.services.trajectories.exportFilteredBundle(
        buildTrajectoryRequest(body ?? {}),
      ),
    );
  }

  if (request.method === "POST" && url.pathname === "/trajectories/analyze") {
    const body = await readJsonBody<TrajectoryDatasetBody>(request);
    return json({
      analysis: context.services.trajectories.analyze(
        buildTrajectoryRequest(body ?? {}),
      ),
    });
  }

  if (request.method === "GET" && url.pathname === "/trajectories/bundles") {
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : 20;
    return json({
      bundles:
        (typeof nativeTrajectory?.bundles === "function"
          ? nativeTrajectory.bundles()
          : undefined) ??
        context.services.trajectories.listBundles(
          !Number.isNaN(limit) && limit > 0 ? limit : 20,
        ),
    });
  }

  return null;
};
