import type { AppContext } from "@/runtime/bootstrap";
import {
  cancelEffectiveDelegationTask,
  retryEffectiveDelegationTask,
} from "@/runtime/native/service-bridge/delegation";
import { json } from "@/server/responses";

export async function handleDelegationMutationRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (
    request.method !== "POST" ||
    !url.pathname.startsWith("/delegation/tasks/")
  ) {
    return null;
  }

  const parts = url.pathname.split("/");
  const id = parts[3];
  const action = parts[4];
  const body = ((await request.json().catch(() => ({}))) ?? {}) as {
    note?: string;
    cascadeChildren?: boolean;
  };
  if (!id || !action) {
    return json({ error: "task id and action are required" }, 400);
  }

  if (action === "note") {
    return json({
      task: context.services.delegation.addNote(id, body.note ?? ""),
    });
  }
  if (action === "run") {
    return json({ task: context.services.delegation.markRunning(id) });
  }
  if (action === "retry") {
    return json({
      task: retryEffectiveDelegationTask(
        context.runtime,
        context.services,
        id,
        body.note ?? "Requeued via API.",
      ),
    });
  }
  if (action === "cancel") {
    return json({
      task: cancelEffectiveDelegationTask(
        context.runtime,
        context.services,
        id,
        body.note ?? "Cancelled via API.",
        {
          cascadeChildren: body.cascadeChildren,
        },
      ),
    });
  }
  if (action === "complete") {
    return json({
      task: context.services.delegation.complete(id, body.note),
    });
  }
  if (action === "fail") {
    return json({
      task: context.services.delegation.fail(id, body.note ?? "Task failed.", {
        cascadeChildren: body.cascadeChildren,
      }),
    });
  }

  return json({ error: "unknown delegation action" }, 404);
}
