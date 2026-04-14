import type { AppContext } from "@/runtime/bootstrap";
import { getNativeServices } from "@/runtime/native/service-bridge/runtime";
import { json } from "@/server/responses";

export async function handleSkillSynthesisRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method !== "POST" || url.pathname !== "/skills/synthesize") {
    return null;
  }

  const body = (await request.json()) as { taskId?: string };
  if (!body.taskId) {
    return json({ error: "taskId is required" }, 400);
  }

  const path =
    (await getNativeServices(context.runtime).agentSkills?.synthesize(
      body.taskId,
    )) ??
    (() => {
      const task = context.services.delegation
        .list()
        .find((entry) => entry.id === body.taskId);
      if (!task) {
        return null;
      }
      return context.services.skillSynthesis.synthesizeFromTask(task);
    })();

  return path
    ? json({ path })
    : json({ error: "Delegation task not found" }, 404);
}
