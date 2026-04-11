import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import { handleDelegationCommandRoutes } from "./delegation-commands";

function createContext() {
  const created: Array<Record<string, unknown>> = [];
  const spawned: Array<{ parentId: string; input: Record<string, unknown> }> =
    [];
  const synthesized: unknown[] = [];

  const context = {
    runtime: {},
    services: {
      delegation: {
        create: (input: Record<string, unknown>) => {
          created.push(input);
          return { id: "task-created", ...input };
        },
        spawnChild: (parentId: string, input: Record<string, unknown>) => {
          spawned.push({ parentId, input });
          return { id: `${parentId}:child`, parentId, ...input };
        },
        supervise: async (
          runner: (task: unknown) => Promise<string>,
          options?: {
            concurrency?: number;
            onComplete?: (task: unknown) => Promise<void> | void;
          },
        ) => {
          const task = { id: "task-queued", notes: ["queued"] };
          const note = await runner(task);
          await options?.onComplete?.(task);
          return {
            concurrency: options?.concurrency,
            note,
          };
        },
      },
      skillSynthesis: {
        synthesizeFromTask: (task: unknown) => {
          synthesized.push(task);
          return "skill.md";
        },
      },
    },
  } as unknown as AppContext;

  return { context, created, spawned, synthesized };
}

describe("handleDelegationCommandRoutes", () => {
  it("creates and spawns delegation tasks", async () => {
    const { context, created, spawned } = createContext();

    const createResponse = await handleDelegationCommandRoutes(
      context,
      new Request("http://localhost/delegation/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: "Investigate",
          objective: "Check browser flow",
          labels: ["browser"],
        }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/delegation/tasks"),
    );
    const spawnResponse = await handleDelegationCommandRoutes(
      context,
      new Request("http://localhost/delegation/tasks/task-created/spawn", {
        method: "POST",
        body: JSON.stringify({
          objective: "Check child flow",
          title: "Child",
        }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/delegation/tasks/task-created/spawn"),
    );

    await expect(createResponse?.json()).resolves.toEqual({
      task: {
        id: "task-created",
        title: "Investigate",
        objective: "Check browser flow",
        labels: ["browser"],
        tags: ["browser"],
      },
    });
    await expect(spawnResponse?.json()).resolves.toEqual({
      task: {
        id: "task-created:child",
        parentId: "task-created",
        title: "Child",
        objective: "Check child flow",
        labels: undefined,
        tags: undefined,
        metadata: undefined,
        group: undefined,
        profile: undefined,
        priority: undefined,
        executionMode: undefined,
        maxAttempts: undefined,
      },
    });
    expect(created[0]).toMatchObject({
      title: "Investigate",
      objective: "Check browser flow",
      labels: ["browser"],
      tags: ["browser"],
    });
    expect(spawned[0]).toEqual({
      parentId: "task-created",
      input: {
        title: "Child",
        objective: "Check child flow",
        group: undefined,
        profile: undefined,
        priority: undefined,
        tags: undefined,
        labels: undefined,
        metadata: undefined,
        executionMode: undefined,
        maxAttempts: undefined,
      },
    });
  });

  it("validates create and spawn payloads", async () => {
    const { context } = createContext();

    const invalidCreate = await handleDelegationCommandRoutes(
      context,
      new Request("http://localhost/delegation/tasks", {
        method: "POST",
        body: JSON.stringify({ title: "Missing objective" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/delegation/tasks"),
    );
    const invalidSpawn = await handleDelegationCommandRoutes(
      context,
      new Request("http://localhost/delegation/tasks/task-created/spawn", {
        method: "POST",
        body: JSON.stringify({ title: "Missing objective" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/delegation/tasks/task-created/spawn"),
    );

    expect(invalidCreate?.status).toBe(400);
    await expect(invalidCreate?.json()).resolves.toEqual({
      error: "title and objective are required",
    });
    expect(invalidSpawn?.status).toBe(400);
    await expect(invalidSpawn?.json()).resolves.toEqual({
      error: "objective is required",
    });
  });

  it("supervises queued work and executes a single task through injected runners", async () => {
    const { context, synthesized } = createContext();

    const supervise = await handleDelegationCommandRoutes(
      context,
      new Request("http://localhost/delegation/supervise", {
        method: "POST",
        body: JSON.stringify({ concurrency: 3 }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/delegation/supervise"),
      {
        runDelegationTaskInWorker: async (_context, taskId) => ({
          id: taskId,
          notes: ["worker finished"],
        }),
      },
    );
    const execute = await handleDelegationCommandRoutes(
      context,
      new Request("http://localhost/delegation/tasks/task-created/execute", {
        method: "POST",
      }),
      new URL("http://localhost/delegation/tasks/task-created/execute"),
      {
        runAgentTurn: async (input) => ({
          message: input.message,
          roomId: input.roomId,
        }),
      },
    );

    await expect(supervise?.json()).resolves.toEqual({
      report: {
        concurrency: 3,
        note: "worker finished",
      },
    });
    await expect(execute?.json()).resolves.toEqual({
      result: {
        message: "/delegate execute task-created",
        roomId: "api-delegation",
      },
    });
    expect(synthesized).toEqual([{ id: "task-queued", notes: ["queued"] }]);
  });

  it("returns unknown delegation action and null for unrelated routes", async () => {
    const { context } = createContext();

    const unknown = await handleDelegationCommandRoutes(
      context,
      new Request("http://localhost/delegation/tasks/task-created/unknown", {
        method: "POST",
      }),
      new URL("http://localhost/delegation/tasks/task-created/unknown"),
    );
    const unrelated = await handleDelegationCommandRoutes(
      context,
      new Request("http://localhost/not-delegation"),
      new URL("http://localhost/not-delegation"),
    );

    expect(unknown?.status).toBe(404);
    await expect(unknown?.json()).resolves.toEqual({
      error: "unknown delegation action",
    });
    expect(unrelated).toBeNull();
  });
});
