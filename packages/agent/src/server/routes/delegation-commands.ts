import type { AppContext } from "@/runtime/bootstrap";
import { handleAgentTurn } from "@/runtime/chat";
import { runDelegationTaskInWorker } from "@/runtime/delegation/run-task-in-worker";
import {
  createEffectiveDelegationTask,
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

function toDelegationTaskInput(body: DelegationTaskBody) {
  return {
    title: body.title,
    objective: body.objective,
    group: body.group,
    profile: body.profile,
    priority: body.priority,
    tags: body.tags ?? body.labels,
    labels: body.labels ?? body.tags,
    metadata: body.metadata,
    executionMode: body.executionMode,
    maxAttempts: body.maxAttempts,
  };
}

export async function handleDelegationCommandRoutes(
  context: AppContext,
  request: Request,
  url: URL,
  options?: DelegationCommandRouteOptions,
): Promise<Response | null> {
  const runWorker = (options?.runDelegationTaskInWorker ??
    runDelegationTaskInWorker) as DelegationWorkerRunner;
  const runAgentTurn = options?.runAgentTurn ?? handleAgentTurn;

  if (request.method === "POST" && url.pathname === "/delegation/tasks") {
    const body = (await request.json()) as DelegationTaskBody;
    if (!body.title || !body.objective) {
      return json({ error: "title and objective are required" }, 400);
    }
    return json({
      task: createEffectiveDelegationTask(
        context.runtime,
        context.services,
        toDelegationTaskInput(body) as Required<
          Pick<DelegationTaskBody, "title" | "objective">
        > &
          Omit<ReturnType<typeof toDelegationTaskInput>, "title" | "objective">,
      ),
    });
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

    return json({
      task: spawnEffectiveDelegationChild(
        context.runtime,
        context.services,
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
          executionMode: body.executionMode,
          maxAttempts: body.maxAttempts,
        },
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/delegation/supervise") {
    const body = ((await request.json().catch(() => ({}))) ?? {}) as {
      concurrency?: number;
    };
    const report = await superviseEffectiveDelegationQueue(
      context.runtime,
      context.services,
      async (task) => {
        const completedTask = await runWorker(
          context,
          (task as { id: string }).id,
          {
            assumeRunning: true,
          },
        );
        return completedTask.notes?.at(-1) ?? "Delegated worker completed.";
      },
      {
        concurrency:
          typeof body.concurrency === "number" && body.concurrency > 0
            ? body.concurrency
            : 2,
        onComplete: async (task: unknown) => {
          context.services.skillSynthesis.synthesizeFromTask(
            task as Parameters<
              typeof context.services.skillSynthesis.synthesizeFromTask
            >[0],
          );
        },
      },
    );
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
