import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "../chat";
import { handleDelegationCommand } from "./delegation-commands";

function createTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    title: "Investigate issue",
    status: "pending",
    executionMode: "delegated",
    workerMode: "process",
    group: "research",
    profile: "research",
    priority: "high",
    attempts: 1,
    maxAttempts: 3,
    childTaskIds: ["task-2"],
    workerPid: 4242,
    objective: "Inspect the failing flow",
    labels: ["focus"],
    tags: ["focus"],
    parentTaskId: undefined,
    alive: true,
    stalled: false,
    attemptsRemaining: 2,
    durationMs: 12,
    lastOutputPath: "/tmp/task-1.out",
    ...overrides,
  };
}

function createContext(options?: { native?: boolean }) {
  let createCounter = 0;
  const baseTask = createTask();
  const childTask = createTask({
    id: "task-2",
    title: "Child investigation",
    parentTaskId: "task-1",
    childTaskIds: [],
  });
  const events = {
    created: [] as Array<Record<string, unknown>>,
    spawned: [] as Array<Record<string, unknown>>,
    notes: [] as Array<{ id: string; note: string }>,
    retried: [] as Array<Record<string, unknown>>,
    cancelled: [] as Array<Record<string, unknown>>,
    completed: [] as Array<Record<string, unknown>>,
    synthesized: [] as Array<Record<string, unknown>>,
    workerRuns: [] as Array<{ id: string; assumeRunning?: boolean }>,
  };

  const context = {
    runtime: {
      getService: (service: string) => {
        if (service === "agent_orchestrator" && options?.native) {
          return {
            tasks: () => [
              createTask({ id: "native-task", title: "Native task" }),
            ],
            queue: () => ({ source: "native-queue" }),
            overview: () => ({ source: "native-overview" }),
            getTask: (id: string) => createTask({ id }),
            getChildren: (id: string) => [createTask({ id: `${id}:child` })],
            tree: (id: string) => ({ id, children: [childTask] }),
          };
        }
        return undefined;
      },
    },
    services: {
      delegation: {
        list: () => [baseTask],
        pending: () => [baseTask],
        queueSummary: () => ({ source: "local-queue" }),
        overview: () => ({
          activeWorkers: 1,
          aliveWorkers: 1,
          stalledWorkers: 0,
          running: 1,
          pending: 1,
          completed: 2,
          failed: 0,
          byGroup: [{ group: "research", count: 1 }],
          byLabel: [{ label: "focus", count: 1 }],
        }),
        listByGroup: (group: string) =>
          group === "research" ? [baseTask] : [],
        listByLabel: (label: string) => (label === "focus" ? [baseTask] : []),
        listChildren: (parentId: string) =>
          parentId === "task-1" ? [childTask] : [],
        tree: (id: string) => ({ id, children: [childTask] }),
        get: (id: string) => (id === "task-2" ? childTask : baseTask),
        create: (input: Record<string, unknown>) => {
          const task = createTask({
            id: `created-${++createCounter}`,
            status: "pending",
            ...input,
          });
          events.created.push(task);
          return task;
        },
        spawnChild: (parentId: string, input: Record<string, unknown>) => {
          const task = createTask({
            id: `spawned-${++createCounter}`,
            parentTaskId: parentId,
            status: "pending",
            ...input,
          });
          events.spawned.push(task);
          return task;
        },
        addNote: (id: string, note: string) => {
          events.notes.push({ id, note });
          return { id, note };
        },
        markRunning: (id: string) => ({ id, status: "running" }),
        complete: (id: string, note?: string) => {
          const record = { id, status: "completed", note };
          events.completed.push(record);
          return { ...record, notes: note ? [note] : [] };
        },
        requeue: (
          id: string,
          note?: string,
          retryOptions?: { cascadeChildren?: boolean },
        ) => {
          const record = {
            id,
            status: "pending",
            note,
            cascadeChildren: retryOptions?.cascadeChildren ?? false,
          };
          events.retried.push(record);
          return record;
        },
        cancel: (
          id: string,
          note?: string,
          cancelOptions?: { cascadeChildren?: boolean },
        ) => {
          const record = {
            id,
            status: "cancelled",
            note,
            cascadeChildren: cancelOptions?.cascadeChildren ?? false,
          };
          events.cancelled.push(record);
          return record;
        },
        workers: () => [baseTask],
        supervise: async (
          runner: (task: unknown) => Promise<string>,
          superviseOptions?: {
            concurrency?: number;
            filter?: Record<string, unknown>;
            onComplete?: (task: unknown) => Promise<void> | void;
          },
        ) => {
          const task = { id: "task-1" };
          const output = await runner(task);
          await superviseOptions?.onComplete?.(task);
          return {
            ok: true,
            output,
            concurrency: superviseOptions?.concurrency ?? 0,
            filter: superviseOptions?.filter ?? null,
          };
        },
      },
      skillSynthesis: {
        synthesizeFromTask: (task: Record<string, unknown>) => {
          events.synthesized.push(task);
        },
      },
    },
  } as unknown as AgentExecutionContext;

  const runDelegationTaskInWorker = async (
    id: string,
    workerOptions?: { assumeRunning?: boolean },
  ) => {
    events.workerRuns.push({
      id,
      assumeRunning: workerOptions?.assumeRunning,
    });
    return {
      id,
      status: "completed",
      notes: [`worker:${id}`],
    };
  };

  return { context, events, runDelegationTaskInWorker };
}

describe("delegation command router", () => {
  it("prefers native delegation inventory for list, overview, and queue", async () => {
    const { context, runDelegationTaskInWorker } = createContext({
      native: true,
    });

    const listed = await handleDelegationCommand("/delegate", context, {
      runDelegationTaskInWorker,
    });
    const overview = await handleDelegationCommand(
      "/delegate overview",
      context,
      {
        runDelegationTaskInWorker,
      },
    );
    const queue = await handleDelegationCommand("/delegate queue", context, {
      runDelegationTaskInWorker,
    });

    expect(listed).toContain("native-task");
    expect(overview).toContain('"source": "native-overview"');
    expect(queue).toContain('"source": "native-queue"');
  });

  it("creates, spawns, retries, cancels, and completes delegation tasks", async () => {
    const { context, events, runDelegationTaskInWorker } = createContext();

    const created = await handleDelegationCommand(
      "/delegate create Investigate | group:research | profile:research | priority:high | labels:focus,ui | metadata:owner=alice :: inspect the issue",
      context,
      { runDelegationTaskInWorker },
    );
    const spawned = await handleDelegationCommand(
      "/delegate spawn task-1 | title:Child Task | labels:focus :: follow up",
      context,
      { runDelegationTaskInWorker },
    );
    const retried = await handleDelegationCommand(
      "/retry task-1 | cascade:children :: try again",
      context,
      { runDelegationTaskInWorker },
    );
    const cancelled = await handleDelegationCommand(
      "/delegate cancel task-1 :: stop now",
      context,
      { runDelegationTaskInWorker },
    );
    const completed = await handleDelegationCommand(
      "/delegate complete task-1 :: wrapped up",
      context,
      { runDelegationTaskInWorker },
    );

    expect(created).toContain('"id": "created-1"');
    expect(events.created[0]).toMatchObject({
      group: "research",
      profile: "research",
      executionMode: "delegated",
      labels: ["focus", "ui"],
      metadata: { owner: "alice" },
    });
    expect(spawned).toContain('"id": "spawned-2"');
    expect(events.spawned[0]).toMatchObject({
      parentTaskId: "task-1",
      title: "Child Task",
    });
    expect(retried).toContain('"cascadeChildren": true');
    expect(cancelled).toContain('"status": "cancelled"');
    expect(completed).toContain('"status": "completed"');
  });

  it("executes and supervises delegated workers through the injected callback", async () => {
    const { context, events, runDelegationTaskInWorker } = createContext();

    const executed = await handleDelegationCommand(
      "/delegate execute task-1",
      context,
      { runDelegationTaskInWorker },
    );
    const supervised = await handleDelegationCommand(
      "/delegate supervise concurrency:3 label:focus",
      context,
      { runDelegationTaskInWorker },
    );
    const queued = await handleDelegationCommand(
      "/delegate execute-queued 4",
      context,
      { runDelegationTaskInWorker },
    );

    expect(executed).toContain('"status": "completed"');
    expect(supervised).toContain('"concurrency": 3');
    expect(supervised).toContain('"label": "focus"');
    expect(queued).toContain('"concurrency": 4');
    expect(events.workerRuns).toEqual([
      { id: "task-1", assumeRunning: undefined },
      { id: "task-1", assumeRunning: true },
      { id: "task-1", assumeRunning: true },
    ]);
    expect(events.synthesized).toHaveLength(2);
  });

  it("renders worker, grouping, child, note, status, and tree views", async () => {
    const { context, events, runDelegationTaskInWorker } = createContext();

    const workers = await handleDelegationCommand(
      "/delegate workers",
      context,
      {
        runDelegationTaskInWorker,
      },
    );
    const group = await handleDelegationCommand(
      "/delegate group research",
      context,
      { runDelegationTaskInWorker },
    );
    const label = await handleDelegationCommand(
      "/delegate label focus",
      context,
      { runDelegationTaskInWorker },
    );
    const children = await handleDelegationCommand(
      "/delegate children task-1",
      context,
      { runDelegationTaskInWorker },
    );
    const note = await handleDelegationCommand(
      "/delegate note task-1 :: keep digging",
      context,
      { runDelegationTaskInWorker },
    );
    const status = await handleDelegationCommand(
      "/delegate status task-1",
      context,
      { runDelegationTaskInWorker },
    );
    const running = await handleDelegationCommand(
      "/delegate run task-1",
      context,
      { runDelegationTaskInWorker },
    );
    const tree = await handleDelegationCommand(
      "/delegate tree task-1",
      context,
      {
        runDelegationTaskInWorker,
      },
    );

    expect(workers).toContain("Workers: active=1 alive=1");
    expect(group).toContain("Investigate issue");
    expect(label).toContain("Investigate issue");
    expect(children).toContain("Child investigation");
    expect(note).toContain("keep digging");
    expect(events.notes).toEqual([{ id: "task-1", note: "keep digging" }]);
    expect(status).toContain('"id": "task-1"');
    expect(running).toContain('"status": "running"');
    expect(tree).toContain('"children"');
  });
});
