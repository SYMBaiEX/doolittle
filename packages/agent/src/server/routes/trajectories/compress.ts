import { json } from "@/server/responses";
import { readJsonBody } from "./helpers";
import type { TrajectoryCompressBody, TrajectoryRouteHandler } from "./types";

export const handleTrajectoryCompressRoutes: TrajectoryRouteHandler = async (
  context,
  request,
  url,
): Promise<Response | null> => {
  if (
    request.method === "GET" &&
    url.pathname === "/trajectories/compress/latest"
  ) {
    const compressed = context.services.trajectories.compressLatest();
    return compressed
      ? json({ compressed })
      : json({ error: "No trajectory bundles recorded." }, 404);
  }

  if (request.method === "POST" && url.pathname === "/trajectories/compress") {
    const body = await readJsonBody<TrajectoryCompressBody>(request);
    if (!body?.manifestPath) {
      return json({ error: "manifestPath is required" }, 400);
    }
    return json({
      compressed: context.services.trajectories.compressBundle(
        body.manifestPath,
        {
          sampleCount: body.sampleCount,
        },
      ),
    });
  }

  return null;
};
