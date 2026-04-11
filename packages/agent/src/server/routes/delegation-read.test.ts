import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import { handleDelegationReadRoutes } from "./delegation-read";

function createContext() {
  const calls: Array<Record<string, unknown> | undefined> = [];
  const context = {
    runtime: {},
    services: {
      delegation: {
        list: (filters?: Record<string, unknown>) => {
          calls.push(filters);
          if (filters?.group === "ops") {
            return [{ id: "task-filtered", group: "ops" }];
          }
          return [{ id: "task-1" }, { id: "task-2" }];
        },
        get: (id: string) => ({ id, detail: true }),
        listChildren: (id: string) => [{ id: `${id}:child` }],
        tree: (id: string) => ({ id, children: [] }),
        queueSummary: () => ({ pending: 2, activeWorkers: 1 }),
        overview: () => ({
          byGroup: { ops: 1 },
          byLabel: { urgent: 1 },
        }),
        workers: (limit: number, filters?: Record<string, unknown>) => [
          { id: `worker:${limit}`, filters },
        ],
      },
    },
  } as unknown as AppContext;

  return { context, calls };
}

describe("handleDelegationReadRoutes", () => {
  it("returns task lists through the native fast path and filtered local path", async () => {
    const { context, calls } = createContext();
    const fastPath = await handleDelegationReadRoutes(
      context,
      new Request("http://localhost/delegation/tasks?limit=1"),
      new URL("http://localhost/delegation/tasks?limit=1"),
    );
    const filtered = await handleDelegationReadRoutes(
      context,
      new Request("http://localhost/delegation/tasks?group=ops&limit=5"),
      new URL("http://localhost/delegation/tasks?group=ops&limit=5"),
    );

    await expect(fastPath?.json()).resolves.toEqual({
      tasks: [{ id: "task-1" }],
    });
    await expect(filtered?.json()).resolves.toEqual({
      tasks: [{ id: "task-filtered", group: "ops" }],
    });
    expect(calls).toContainEqual({
      group: "ops",
      profile: undefined,
      priority: undefined,
      label: undefined,
      parentTaskId: undefined,
      status: undefined,
      executionMode: undefined,
    });
  });

  it("returns task detail, children, and tree payloads", async () => {
    const { context } = createContext();
    const task = await handleDelegationReadRoutes(
      context,
      new Request("http://localhost/delegation/tasks/task-1"),
      new URL("http://localhost/delegation/tasks/task-1"),
    );
    const children = await handleDelegationReadRoutes(
      context,
      new Request("http://localhost/delegation/tasks/task-1/children"),
      new URL("http://localhost/delegation/tasks/task-1/children"),
    );
    const tree = await handleDelegationReadRoutes(
      context,
      new Request("http://localhost/delegation/tasks/task-1/tree"),
      new URL("http://localhost/delegation/tasks/task-1/tree"),
    );

    await expect(task?.json()).resolves.toEqual({
      task: { id: "task-1", detail: true },
    });
    await expect(children?.json()).resolves.toEqual({
      children: [{ id: "task-1:child" }],
    });
    await expect(tree?.json()).resolves.toEqual({
      tree: { id: "task-1", children: [] },
    });
  });

  it("returns overview, groups, and filtered worker payloads", async () => {
    const { context } = createContext();
    const overview = await handleDelegationReadRoutes(
      context,
      new Request("http://localhost/delegation/overview"),
      new URL("http://localhost/delegation/overview"),
    );
    const groups = await handleDelegationReadRoutes(
      context,
      new Request("http://localhost/delegation/groups"),
      new URL("http://localhost/delegation/groups"),
    );
    const workers = await handleDelegationReadRoutes(
      context,
      new Request("http://localhost/delegation/workers?limit=3&group=ops"),
      new URL("http://localhost/delegation/workers?limit=3&group=ops"),
    );

    await expect(overview?.json()).resolves.toEqual({
      overview: {
        local: { byGroup: { ops: 1 }, byLabel: { urgent: 1 } },
        native: { pending: 2, activeWorkers: 1 },
      },
    });
    await expect(groups?.json()).resolves.toEqual({
      groups: { ops: 1 },
      labels: { urgent: 1 },
    });
    await expect(workers?.json()).resolves.toEqual({
      overview: { byGroup: { ops: 1 }, byLabel: { urgent: 1 } },
      workers: [
        {
          id: "worker:3",
          filters: {
            group: "ops",
            profile: undefined,
            priority: undefined,
            label: undefined,
            parentTaskId: undefined,
            status: undefined,
            executionMode: undefined,
          },
        },
      ],
    });
  });

  it("returns null for unrelated routes", async () => {
    const { context } = createContext();
    const response = await handleDelegationReadRoutes(
      context,
      new Request("http://localhost/not-delegation"),
      new URL("http://localhost/not-delegation"),
    );

    expect(response).toBeNull();
  });
});
