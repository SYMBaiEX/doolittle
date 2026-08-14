import type { AppContext } from "@/runtime/bootstrap";
import {
  addEffectiveDelegationNote,
  cancelEffectiveDelegationTask,
  completeEffectiveDelegationTask,
  getOfficialOrchestrator,
  retryEffectiveDelegationTask,
} from "@/runtime/native/service-bridge/delegation";
import { readJsonObjectBody } from "@/server/request-body";
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
  if (!getOfficialOrchestrator(context.runtime)) {
    return json(
      {
        available: false,
        code: "ORCHESTRATOR_TASK_SERVICE_UNAVAILABLE",
        error:
          "Delegation is unavailable because the official orchestrator task service is not registered.",
      },
      503,
    );
  }

  const parts = url.pathname.split("/");
  const id = parts[3];
  const action = parts[4];
  if (!id || !action) {
    return json({ error: "task id and action are required" }, 400);
  }
  const parsed = await readJsonObjectBody(request);
  if (!parsed.ok) {
    return json(
      {
        error:
          parsed.reason === "invalid_json"
            ? "Invalid JSON body"
            : "JSON body must be an object",
      },
      400,
    );
  }
  const body = parsed.value as {
    note?: string;
    cascadeChildren?: boolean;
  };
  if (body.note !== undefined && typeof body.note !== "string") {
    return json({ error: "note must be a string" }, 400);
  }
  if (
    body.cascadeChildren !== undefined &&
    typeof body.cascadeChildren !== "boolean"
  ) {
    return json({ error: "cascadeChildren must be a boolean" }, 400);
  }

  if (action === "note") {
    return json({
      task: await addEffectiveDelegationNote(
        context.runtime,
        context.services.delegationProjection,
        id,
        body.note ?? "",
      ),
    });
  }
  if (action === "run") {
    return json(
      {
        code: "OFFICIAL_LIFECYCLE_OWNS_STATUS",
        error:
          "Task status is derived from official ACP sessions. Execute the task to start a session.",
      },
      409,
    );
  }
  if (action === "retry") {
    return json({
      task: await retryEffectiveDelegationTask(
        context.runtime,
        context.services.delegationProjection,
        id,
        body.note ?? "Requeued via API.",
      ),
    });
  }
  if (action === "cancel") {
    return json({
      task: await cancelEffectiveDelegationTask(
        context.runtime,
        context.services.delegationProjection,
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
      task: await completeEffectiveDelegationTask(
        context.runtime,
        context.services.delegationProjection,
        id,
        body.note,
      ),
    });
  }
  if (action === "fail") {
    return json(
      {
        code: "OFFICIAL_LIFECYCLE_OWNS_STATUS",
        error:
          "The official orchestrator derives failure from ACP session events; manual failure is not supported.",
      },
      409,
    );
  }

  return json({ error: "unknown delegation action" }, 404);
}
