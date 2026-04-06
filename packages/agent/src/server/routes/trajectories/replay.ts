import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";
import { findBundle, readJsonBody } from "./helpers";
import type { TrajectoryReplayBody, TrajectoryRouteHandler } from "./types";

function buildReplayResponse(context: AppContext, manifestPath: string) {
  return json({
    replay: context.services.trajectories.replayBundle(manifestPath),
  });
}

export const handleTrajectoryReplayRoutes: TrajectoryRouteHandler = async (
  context,
  request,
  url,
): Promise<Response | null> => {
  if (request.method === "GET" && url.pathname === "/trajectories/replay") {
    const manifestPath = url.searchParams.get("manifestPath");
    const label = url.searchParams.get("label");
    const latest = url.searchParams.get("latest") === "true";
    if (latest) {
      const replay = context.services.trajectories.replayLatest();
      return replay
        ? json({ replay })
        : json({ error: "No trajectory bundles recorded." }, 404);
    }
    if (manifestPath) {
      return buildReplayResponse(context, manifestPath);
    }
    if (label) {
      const bundle = findBundle(context, label);
      if (!bundle) {
        return json({ error: "Trajectory bundle not found." }, 404);
      }
      return buildReplayResponse(context, bundle.manifestPath);
    }
    return json(
      { error: "manifestPath, label, or latest=true is required" },
      400,
    );
  }

  if (
    request.method === "GET" &&
    url.pathname === "/trajectories/replay/latest"
  ) {
    const replay = context.services.trajectories.replayLatest();
    return replay
      ? json({ replay })
      : json({ error: "No trajectory bundles recorded." }, 404);
  }

  if (request.method === "POST" && url.pathname === "/trajectories/replay") {
    const body = await readJsonBody<TrajectoryReplayBody>(request);
    if (body?.latest) {
      const replay = context.services.trajectories.replayLatest();
      return replay
        ? json({ replay })
        : json({ error: "No trajectory bundles recorded." }, 404);
    }
    if (!body?.manifestPath && !body?.label) {
      return json({ error: "manifestPath or label is required" }, 400);
    }
    const manifestPath =
      body?.manifestPath ?? findBundle(context, body?.label)?.manifestPath;
    if (!manifestPath) {
      return json({ error: "Trajectory bundle not found." }, 404);
    }
    return buildReplayResponse(context, manifestPath);
  }

  return null;
};
