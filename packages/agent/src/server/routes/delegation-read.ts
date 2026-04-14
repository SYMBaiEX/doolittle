import type { AppContext } from "@/runtime/bootstrap";
import {
  getEffectiveDelegationChildren,
  getEffectiveDelegationQueue,
  getEffectiveDelegationTask,
  getEffectiveDelegationTasks,
  getEffectiveDelegationTree,
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
  if (request.method === "GET" && url.pathname === "/delegation/tasks") {
    const filters = parseDelegationFilters(url);
    const nativeTasks = getEffectiveDelegationTasks(
      context.runtime,
      context.services,
    );
    if (
      !filters.group &&
      !filters.profile &&
      !filters.priority &&
      !filters.label &&
      !filters.parentTaskId &&
      !filters.status &&
      !filters.executionMode &&
      Array.isArray(nativeTasks)
    ) {
      return json({
        tasks: nativeTasks.slice(0, filters.limit),
      });
    }
    return json({
      tasks: context.services.delegation
        .list({
          group: filters.group,
          profile: filters.profile,
          priority: filters.priority,
          label: filters.label,
          parentTaskId: filters.parentTaskId,
          status: filters.status,
          executionMode: filters.executionMode,
        })
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
        task: getEffectiveDelegationTask(context.runtime, context.services, id),
      });
    }
    if (action === "children") {
      return json({
        children: getEffectiveDelegationChildren(
          context.runtime,
          context.services,
          id,
        ),
      });
    }
    if (action === "tree") {
      return json({
        tree: getEffectiveDelegationTree(context.runtime, context.services, id),
      });
    }
  }

  if (request.method === "GET" && url.pathname === "/delegation/overview") {
    return json({
      overview: {
        local: context.services.delegation.overview(),
        native: getEffectiveDelegationQueue(context.runtime, context.services),
      },
    });
  }

  if (request.method === "GET" && url.pathname === "/delegation/groups") {
    const overview = context.services.delegation.overview();
    return json({
      groups: overview.byGroup,
      labels: overview.byLabel,
    });
  }

  if (request.method === "GET" && url.pathname === "/delegation/workers") {
    const filters = parseDelegationFilters(url);
    return json({
      overview: context.services.delegation.overview(),
      workers: context.services.delegation.workers(filters.limit, {
        group: filters.group,
        profile: filters.profile,
        priority: filters.priority,
        label: filters.label,
        parentTaskId: filters.parentTaskId,
        status: filters.status,
        executionMode: filters.executionMode,
      }),
    });
  }

  return null;
}
