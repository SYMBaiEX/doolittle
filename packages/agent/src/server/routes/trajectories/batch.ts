import { json } from "@/server/responses";
import { readJsonBody } from "./helpers";
import type { TrajectoryBatchBody, TrajectoryRouteHandler } from "./types";

export const handleTrajectoryBatchRoutes: TrajectoryRouteHandler = async (
  context,
  request,
  url,
): Promise<Response | null> => {
  if (request.method !== "POST" || url.pathname !== "/trajectories/batch") {
    return null;
  }

  const body = await readJsonBody<TrajectoryBatchBody>(request);
  const prompts = (body?.prompts ?? [])
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!prompts.length) {
    return json({ error: "prompts is required" }, 400);
  }
  const label = body?.label ?? `trajectory-batch-${Date.now()}`;
  const group = `trajectory-batch:${label}`;
  const tasks = prompts.map((prompt, index) =>
    context.services.delegation.create({
      title: `Batch prompt ${index + 1}`,
      objective: prompt,
      group,
      profile: "research",
      priority: "normal",
      labels: ["trajectory", "batch"],
      metadata: {
        source: "trajectory-batch",
        label,
      },
      executionMode: "local",
    }),
  );
  return json({
    batch: context.services.trajectories.createBatchManifest({
      label,
      purpose: body?.purpose ?? "trajectory batch",
      prompts,
      rubric: body?.rubric,
      tags: body?.tags,
      taskIds: tasks.map((task) => task.id),
      group,
    }),
    tasks,
  });
};
