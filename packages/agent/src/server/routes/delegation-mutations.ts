import type { AppContext } from "@/runtime/bootstrap";
import {
  addEffectiveDelegationNote,
  cancelEffectiveDelegationTask,
  completeEffectiveDelegationTask,
  failEffectiveDelegationTask,
  getOfficialOrchestrator,
  retryEffectiveDelegationTask,
} from "@/runtime/native/service-bridge/delegation";
import { readJsonObjectBody } from "@/server/request-body";
import { json } from "@/server/responses";

const MAX_BULK_TASK_MUTATIONS = 500;
type BulkDelegationAction = "cancel" | "complete" | "fail";

async function mutateDelegationTask(
  context: AppContext,
  id: string,
  action: BulkDelegationAction,
  note?: string,
  cascadeChildren?: boolean,
) {
  if (action === "cancel") {
    return cancelEffectiveDelegationTask(
      context.runtime,
      context.services.delegationProjection,
      id,
      note || "Cancelled by operator.",
      { cascadeChildren },
    );
  }
  if (action === "complete") {
    return completeEffectiveDelegationTask(
      context.runtime,
      context.services.delegationProjection,
      id,
      note,
    );
  }
  return failEffectiveDelegationTask(
    context.runtime,
    context.services.delegationProjection,
    id,
    note,
  );
}

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

  if (url.pathname === "/delegation/tasks/bulk") {
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
      action?: unknown;
      ids?: unknown;
      note?: unknown;
      cascadeChildren?: unknown;
    };
    if (
      body.action !== "cancel" &&
      body.action !== "complete" &&
      body.action !== "fail"
    ) {
      return json({ error: "action must be cancel, complete, or fail" }, 400);
    }
    if (
      !Array.isArray(body.ids) ||
      body.ids.length === 0 ||
      body.ids.length > MAX_BULK_TASK_MUTATIONS ||
      body.ids.some((id) => typeof id !== "string" || !id.trim())
    ) {
      return json(
        {
          error: `ids must contain 1 to ${MAX_BULK_TASK_MUTATIONS} task ids`,
        },
        400,
      );
    }
    if (body.note !== undefined && typeof body.note !== "string") {
      return json({ error: "note must be a string" }, 400);
    }
    if (
      body.cascadeChildren !== undefined &&
      typeof body.cascadeChildren !== "boolean"
    ) {
      return json({ error: "cascadeChildren must be a boolean" }, 400);
    }

    const ids = [...new Set(body.ids.map((id) => id.trim()))];
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (let index = 0; index < ids.length; index += 8) {
      const chunk = ids.slice(index, index + 8);
      const settled = await Promise.allSettled(
        chunk.map((id) =>
          mutateDelegationTask(
            context,
            id,
            body.action as BulkDelegationAction,
            body.note as string | undefined,
            body.cascadeChildren as boolean | undefined,
          ),
        ),
      );
      settled.forEach((result, resultIndex) => {
        const id = chunk[resultIndex] ?? "unknown";
        if (result.status === "fulfilled" && result.value) {
          results.push({ id, ok: true });
        } else {
          results.push({
            id,
            ok: false,
            error:
              result.status === "rejected"
                ? "Task mutation failed."
                : "Task was not found.",
          });
        }
      });
    }
    const succeeded = results.filter((result) => result.ok).length;
    return json({
      action: body.action,
      requested: ids.length,
      succeeded,
      failed: ids.length - succeeded,
      results,
    });
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
      task: await mutateDelegationTask(
        context,
        id,
        action,
        body.note ?? "Cancelled via API.",
        body.cascadeChildren,
      ),
    });
  }
  if (action === "complete") {
    return json({
      task: await mutateDelegationTask(context, id, action, body.note),
    });
  }
  if (action === "fail") {
    return json({
      task: await mutateDelegationTask(context, id, action, body.note),
    });
  }

  return json({ error: "unknown delegation action" }, 404);
}
