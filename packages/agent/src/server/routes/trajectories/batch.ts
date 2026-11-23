import { createEffectiveDelegationTask } from "../../../runtime/native/service-bridge/delegation/index";
import { readRouteJsonBody } from "../../request-body";
import { json } from "../../responses";
import type { TrajectoryBatchBody, TrajectoryRouteHandler } from "./types";

export const handleTrajectoryBatchRoutes: TrajectoryRouteHandler = async (
  context,
  request,
  url,
): Promise<Response | null> => {
  if (request.method !== "POST" || url.pathname !== "/trajectories/batch") {
    return null;
  }

  const parsed = await readRouteJsonBody(request);
  if ("response" in parsed) return parsed.response;
  const { prompts: rawPrompts } = parsed.body;
  if (
    !Array.isArray(rawPrompts) ||
    !rawPrompts.every((entry) => typeof entry === "string")
  ) {
    return json({ error: "prompts must be an array of strings" }, 400);
  }
  const prompts = rawPrompts.map((entry) => entry.trim()).filter(Boolean);
  if (!prompts.length) {
    return json({ error: "prompts is required" }, 400);
  }
  const body = parsed.body as TrajectoryBatchBody;
  const label = body?.label ?? `trajectory-batch-${Date.now()}`;
  const group = `trajectory-batch:${label}`;
  const tasks = await Promise.all(
    prompts.map((prompt, index) =>
      createEffectiveDelegationTask(
        context.runtime,
        context.services.delegationProjection,
        {
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
        },
      ),
    ),
  );
  return json({
    batch: context.services.trajectoryEvaluation.createBatchManifest({
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
