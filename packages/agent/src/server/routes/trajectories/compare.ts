import { json } from "@/server/responses";
import { getTrajectoryLogger, readJsonBody } from "./helpers";
import type { TrajectoryCompareBody, TrajectoryRouteHandler } from "./types";

export const handleTrajectoryComparisonRoutes: TrajectoryRouteHandler = async (
  context,
  request,
  url,
): Promise<Response | null> => {
  const nativeTrajectory = getTrajectoryLogger(context);

  if (
    request.method === "GET" &&
    url.pathname === "/trajectories/compare/latest"
  ) {
    const comparison =
      typeof nativeTrajectory?.compareLatest === "function"
        ? nativeTrajectory.compareLatest()
        : context.services.trajectories.compareLatest();
    return comparison
      ? json({ comparison })
      : json({ error: "At least two trajectory bundles are required." }, 404);
  }

  if (request.method === "POST" && url.pathname === "/trajectories/compare") {
    const body = await readJsonBody<TrajectoryCompareBody>(request);
    if (!body?.leftManifestPath || !body?.rightManifestPath) {
      return json(
        { error: "leftManifestPath and rightManifestPath are required" },
        400,
      );
    }
    return json({
      comparison: context.services.trajectories.compareBundles(
        body.leftManifestPath,
        body.rightManifestPath,
      ),
    });
  }

  return null;
};
