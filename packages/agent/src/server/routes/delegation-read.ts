import type { AppContext } from "@/runtime/bootstrap";
import {
  getEffectiveDelegationChildren,
  getEffectiveDelegationOverview,
  getEffectiveDelegationOverviewsSnapshot,
  getEffectiveDelegationTask,
  getEffectiveDelegationTasks,
  getEffectiveDelegationTree,
  getOfficialOrchestrator,
} from "@/runtime/native/service-bridge/delegation";
import { json } from "@/server/responses";

function parseDelegationFilters(url: URL): {
  limit: number;
  group?: string;
  profile?: string;
  priority?: "low" | "normal" | "high";
  label?: string;
  parentTaskId?: string;
  status?: "pending" | "running" | "completed" | "failed" | "cancelled";
  executionMode?: "local" | "delegated";
} {
  const rawLimit = Number(url.searchParams.get("limit") ?? "25");
  const priority = url.searchParams.get("priority") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const executionMode =
    url.searchParams.get("executionMode") ??
    url.searchParams.get("mode") ??
    undefined;

  return {
    limit: Number.isNaN(rawLimit) || rawLimit <= 0 ? 25 : rawLimit,
    group: url.searchParams.get("group") ?? undefined,
    profile: url.searchParams.get("profile") ?? undefined,
    priority:
      priority && ["low", "normal", "high"].includes(priority)
        ? (priority as "low" | "normal" | "high")
        : undefined,
    label:
      url.searchParams.get("label") ?? url.searchParams.get("tag") ?? undefined,
    parentTaskId:
      url.searchParams.get("parentTaskId") ??
      url.searchParams.get("parent") ??
      undefined,
    status:
      status &&
      ["pending", "running", "completed", "failed", "cancelled"].includes(
        status,
      )
        ? (status as
            | "pending"
            | "running"
            | "completed"
            | "failed"
            | "cancelled")
        : undefined,
    executionMode:
      executionMode === "local" || executionMode === "delegated"
        ? executionMode
        : undefined,
  };
}

export async function handleDelegationReadRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (
    url.pathname.startsWith("/delegation/") &&
    !getOfficialOrchestrator(context.runtime)
  ) {
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

  if (request.method === "GET" && url.pathname === "/delegation/tasks") {
    const filters = parseDelegationFilters(url);
    const hasClientSideFilters =
      Boolean(filters.group) ||
      Boolean(filters.profile) ||
      Boolean(filters.priority) ||
      Boolean(filters.label) ||
      Boolean(filters.parentTaskId) ||
      Boolean(filters.status) ||
      Boolean(filters.executionMode);
    const nativeTasks = await getEffectiveDelegationTasks(context.runtime, {
      limit: hasClientSideFilters ? undefined : filters.limit,
    });
    if (!hasClientSideFilters && Array.isArray(nativeTasks)) {
      return json({
        tasks: nativeTasks,
      });
    }
    return json({
      tasks: nativeTasks
        .filter(
          (task) =>
            (!filters.group || task.group === filters.group) &&
            (!filters.profile || task.profile === filters.profile) &&
            (!filters.priority || task.priority === filters.priority) &&
            (!filters.label ||
              (task.labels ?? task.tags ?? []).includes(filters.label)) &&
            (!filters.parentTaskId ||
              task.parentTaskId === filters.parentTaskId) &&
            (!filters.status || task.status === filters.status) &&
            (!filters.executionMode ||
              task.executionMode === filters.executionMode),
        )
        .slice(0, filters.limit),
    });
  }

  if (
    request.method === "GET" &&
    url.pathname.startsWith("/delegation/tasks/")
  ) {
    const parts = url.pathname.split("/");
    const id = parts[3];
    const action = parts[4];
    if (!id) {
      return json({ error: "task id is required" }, 400);
    }
    if (!action) {
      return json({
        task: await getEffectiveDelegationTask(context.runtime, id),
      });
    }
    if (action === "children") {
      return json({
        children: await getEffectiveDelegationChildren(context.runtime, id),
      });
    }
    if (action === "tree") {
      return json({
        tree: await getEffectiveDelegationTree(context.runtime, id),
      });
    }
  }

  if (request.method === "GET" && url.pathname === "/delegation/overview") {
    return json({
      overview: await getEffectiveDelegationOverviewsSnapshot(context.runtime),
    });
  }

  if (request.method === "GET" && url.pathname === "/delegation/groups") {
    const overview = await getEffectiveDelegationOverview(context.runtime);
    return json({
      groups: overview.byGroup,
      labels: overview.byLabel,
    });
  }

  if (request.method === "GET" && url.pathname === "/delegation/workers") {
    const filters = parseDelegationFilters(url);
    return json({
      overview: await getEffectiveDelegationOverview(context.runtime),
      workers: await getEffectiveDelegationTasks(context.runtime, {
        limit: filters.limit,
      }),
    });
  }

  return null;
}
