import type { AppContext } from "@/runtime/bootstrap";
import { handleAgentTurn } from "@/runtime/chat";
import {
  createEffectiveDelegationTask,
  getOfficialOrchestrator,
  spawnEffectiveDelegationChild,
  superviseEffectiveDelegationQueue,
} from "@/runtime/native/service-bridge/delegation";
import { json } from "@/server/responses";

type DelegationTaskBody = {
  title?: string;
  objective?: string;
  group?: string;
  profile?: string;
  priority?: "low" | "normal" | "high";
  tags?: string[];
  labels?: string[];
  metadata?: Record<string, string>;
  workspaceRoot?: string;
  executionMode?: "local" | "delegated";
  maxAttempts?: number;
};

type DelegationWorkerRunner = (
  context: AppContext,
  taskId: string,
  options?: { assumeRunning?: boolean },
) => Promise<{ notes?: string[] }>;

type DelegationAgentTurnRunner = (
  input: {
    message: string;
    userId: string;
    roomId: string;
    source: "api";
  },
  context: AppContext,
) => Promise<unknown>;

type DelegationCommandRouteOptions = {
  runDelegationTaskInWorker?: DelegationWorkerRunner;
  runAgentTurn?: DelegationAgentTurnRunner;
};

function toDelegationTaskInput(
  body: DelegationTaskBody,
  workspaceRoot?: string,
) {
  return {
    title: body.title,
    objective: body.objective,
    group: body.group,
    profile: body.profile,
    priority: body.priority,
    tags: body.tags ?? body.labels,
    labels: body.labels ?? body.tags,
    metadata: body.metadata,
    ...(workspaceRoot ? { workspaceRoot } : {}),
    executionMode: body.executionMode,
    maxAttempts: body.maxAttempts,
  };
}

async function resolveRequestedWorkspaceRoot(
  context: AppContext,
  body: DelegationTaskBody,
): Promise<string | undefined> {
  if (body.workspaceRoot === undefined) return undefined;
  return context.services.repository.resolveWorktreeRoot(body.workspaceRoot);
}

export async function handleDelegationCommandRoutes(
  context: AppContext,
  request: Request,
  url: URL,
  options?: DelegationCommandRouteOptions,
): Promise<Response | null> {
  const runAgentTurn = options?.runAgentTurn ?? handleAgentTurn;

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

  if (request.method === "POST" && url.pathname === "/delegation/tasks") {
    const body = (await request.json()) as DelegationTaskBody;
    if (!body.title || !body.objective) {
      return json({ error: "title and objective are required" }, 400);
    }
    try {
      const workspaceRoot = await resolveRequestedWorkspaceRoot(context, body);
      return json({
        task: await createEffectiveDelegationTask(
          context.runtime,
          context.services.delegation,
          toDelegationTaskInput(body, workspaceRoot) as Required<
            Pick<DelegationTaskBody, "title" | "objective">
          > &
            Omit<
              ReturnType<typeof toDelegationTaskInput>,
              "title" | "objective"
            >,
        ),
      });
    } catch (error) {
      return json(
        {
          error:
            error instanceof Error ? error.message : "Invalid worktree root",
        },
        400,
      );
    }
  }

  if (
    request.method === "POST" &&
    url.pathname.startsWith("/delegation/tasks/") &&
    url.pathname.endsWith("/spawn")
  ) {
    const id = url.pathname.split("/")[3];
    if (!id) {
      return json({ error: "task id is required" }, 400);
    }

    const body = (await request.json()) as DelegationTaskBody;
    if (!body.objective) {
      return json({ error: "objective is required" }, 400);
    }

    try {
      const workspaceRoot = await resolveRequestedWorkspaceRoot(context, body);
      return json({
        task: await spawnEffectiveDelegationChild(
          context.runtime,
          context.services.delegation,
          id,
          {
            title: body.title ?? "Child task",
            objective: body.objective,
            group: body.group,
            profile: body.profile,
            priority: body.priority,
            tags: body.tags ?? body.labels,
            labels: body.labels ?? body.tags,
            metadata: body.metadata,
            ...(workspaceRoot ? { workspaceRoot } : {}),
            executionMode: body.executionMode,
            maxAttempts: body.maxAttempts,
          },
        ),
      });
    } catch (error) {
      return json(
        {
          error:
            error instanceof Error ? error.message : "Invalid worktree root",
        },
        400,
      );
    }
  }

  if (request.method === "POST" && url.pathname === "/delegation/supervise") {
    await request.json().catch(() => ({}));
    const report = await superviseEffectiveDelegationQueue(context.runtime);
    return json({ report });
  }

  if (
    request.method === "POST" &&
    url.pathname.startsWith("/delegation/tasks/") &&
    url.pathname.endsWith("/execute")
  ) {
    const id = url.pathname.split("/")[3];
    if (!id) {
      return json({ error: "task id and action are required" }, 400);
    }
    const result = await runAgentTurn(
      {
        message: `/delegate execute ${id}`,
        userId: "api-delegation",
        roomId: "api-delegation",
        source: "api",
      },
      context,
    );
    return json({ result });
  }

  if (
    request.method === "POST" &&
    url.pathname.startsWith("/delegation/tasks/")
  ) {
    return json({ error: "unknown delegation action" }, 404);
  }

  return null;
}
