import { json } from "@/server/responses";
import { readJsonBody } from "./helpers";
import type { TrajectoryIngestBody, TrajectoryRouteHandler } from "./types";

export const handleTrajectoryIngestRoutes: TrajectoryRouteHandler = async (
  context,
  request,
  url,
): Promise<Response | null> => {
  if (
    request.method === "POST" &&
    url.pathname === "/trajectories/ingest/gateway"
  ) {
    const body = await readJsonBody<TrajectoryIngestBody>(request);
    const history = await context.gateway.history(body?.limit ?? 200);
    return json({
      bundle: context.services.trajectories.ingestGatewayHistory({
        traces: history.traces,
        inbox: history.inbox,
        outbox: history.outbox,
        label: body?.label ?? "gateway-history",
        purpose: body?.purpose ?? "gateway history ingest",
        tags: body?.tags ?? ["gateway", "history"],
        notes: body?.notes,
      }),
    });
  }

  return null;
};
