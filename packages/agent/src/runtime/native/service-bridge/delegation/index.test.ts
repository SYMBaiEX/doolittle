import { ModelType } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { createOfficialOrchestratorTestFixture } from "@/testing/official-orchestrator";
import {
  cancelEffectiveDelegationTask,
  createEffectiveDelegationTask,
  executeEffectiveDelegationTask,
  getEffectiveDelegationTask,
  getEffectiveDelegationTasks,
  OrchestratorTaskServiceUnavailableError,
  projectOfficialTask,
  superviseEffectiveDelegationQueue,
} from ".";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    title: "Official task",
    kind: "coding",
    status: "active",
    priority: "normal",
    paused: false,
    originalRequest: "Use official orchestration",
    summary: undefined,
    sessionCount: 1,
    activeSessionCount: 1,
    latestSessionId: "session-1",
    latestWorkdir: "/repo",
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:01:00.000Z",
    closedAt: null,
    goal: "Use official orchestration",
    parentTaskId: null,
    acceptanceCriteria: [],
    providerPolicy: null,
    metadata: {},
    sessions: [],
    messages: [],
    events: [],
    ...overrides,
  };
}

function runtimeWith(service: Record<string, unknown>) {
  return {
    getService: (name: string) =>
      name === "ORCHESTRATOR_TASK_SERVICE" ? service : null,
  };
}

describe("official delegation service bridge", () => {
  it("reads and projects the official durable task service", async () => {
    const service = {
      listTasks: vi.fn(async () => [detail()]),
      getTask: vi.fn(async () => detail()),
    };

    await expect(
      getEffectiveDelegationTasks(runtimeWith(service) as never),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "task-1",
        objective: "Use official orchestration",
        kind: "coding",
        status: "running",
        executionMode: "delegated",
      }),
    ]);
    await expect(
      getEffectiveDelegationTask(runtimeWith(service) as never, "task-1"),
    ).resolves.toMatchObject({ id: "task-1", status: "running" });
  });

  it("keeps capability profile separate from an explicitly selected framework", async () => {
    const createTask = vi.fn(async () => detail());
    const service = { createTask };

    await createEffectiveDelegationTask(
      runtimeWith(service) as never,
      undefined,
      {
        title: "Migrate",
        objective: "Remove the local store",
        capabilityProfile: "research",
        framework: "codex",
        group: "platform",
        priority: "high",
        labels: ["orchestrator"],
        workspaceRoot: "/repo",
      },
    );

    expect(createTask).toHaveBeenCalledWith({
      title: "Migrate",
      goal: "Remove the local store",
      originalRequest: "Remove the local store",
      kind: "research",
      priority: "high",
      providerPolicy: { preferredFramework: "codex" },
      metadata: expect.objectContaining({
        group: "platform",
        profile: "research",
        capabilityProfile: "research",
        labels: ["orchestrator"],
        workspaceRoot: "/repo",
      }),
    });
  });

  it("defaults to coding and does not turn a legacy profile into a framework", async () => {
    const createTask = vi.fn(async () => detail());

    await createEffectiveDelegationTask(
      runtimeWith({ createTask }) as never,
      undefined,
      {
        title: "Compatibility task",
        objective: "Keep existing callers working",
        profile: "research",
      },
    );

    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "research",
        providerPolicy: undefined,
        metadata: expect.objectContaining({ capabilityProfile: "research" }),
      }),
    );
  });

  it("returns a compatibility unavailable state for manual supervision", async () => {
    await expect(
      superviseEffectiveDelegationQueue(runtimeWith({}) as never),
    ).resolves.toEqual({
      available: false,
      delegated: true,
      owner: "ORCHESTRATOR_TASK_SUPERVISOR",
      reason:
        "Manual Doolittle queue supervision was removed; the official orchestrator supervises task sessions.",
    });
  });

  it("fails explicitly instead of falling back to a second task store", async () => {
    await expect(
      getEffectiveDelegationTasks({ getService: () => null } as never),
    ).rejects.toBeInstanceOf(OrchestratorTaskServiceUnavailableError);
  });

  it("maps official terminal and paused states into the legacy read model", () => {
    expect(
      projectOfficialTask(detail({ status: "done" }) as never).status,
    ).toBe("completed");
    expect(
      projectOfficialTask(detail({ status: "active", paused: true }) as never)
        .status,
    ).toBe("pending");
    expect(
      projectOfficialTask(detail({ status: "archived" }) as never).status,
    ).toBe("cancelled");
  });

  it("projects the official coding or research kind for operator receipts", () => {
    expect(
      projectOfficialTask(detail({ kind: "research" }) as never).kind,
    ).toBe("research");
    expect(projectOfficialTask(detail({ kind: "coding" }) as never).kind).toBe(
      "coding",
    );
  });

  it("projects sessionless Eliza research as an inline local execution", () => {
    expect(
      projectOfficialTask(
        detail({
          kind: "research",
          status: "done",
          sessionCount: 0,
          activeSessionCount: 0,
          latestSessionId: null,
          sessions: [],
          metadata: {
            capabilityProfile: "research",
            researchRun: {
              status: "completed",
              startedAt: "2026-07-28T00:00:30.000Z",
            },
          },
        }) as never,
      ),
    ).toMatchObject({
      executionMode: "local",
      workerMode: "inline",
      attempts: 1,
      startedAt: "2026-07-28T00:00:30.000Z",
      sessionId: undefined,
    });
  });

  it("prefers the latest official session assignment over caller metadata", () => {
    const projected = projectOfficialTask(
      detail({
        metadata: {
          accountProviderId: "metadata-provider",
          accountId: "metadata-account",
          accountLabel: "metadata-label",
          sessionId: "metadata-session",
        },
        sessions: [
          {
            sessionId: "official-session",
            accountProviderId: "official-provider",
            accountId: "official-account",
            accountLabel: "Official account",
            framework: "codex",
            label: "Official session",
            workdir: "/repo",
            status: "completed",
            completionSummary: null,
            metadata: {},
          },
        ],
      }) as never,
    );

    expect(projected).toMatchObject({
      accountProviderId: "official-provider",
      accountId: "official-account",
      accountLabel: "Official account",
      sessionId: "official-session",
    });
  });

  it("uses legacy attribution metadata only before an official session exists", () => {
    expect(
      projectOfficialTask(
        detail({
          metadata: {
            accountProviderId: "metadata-provider",
            accountId: "metadata-account",
            accountLabel: "Metadata account",
            sessionId: "metadata-session",
          },
        }) as never,
      ),
    ).toMatchObject({
      accountProviderId: "metadata-provider",
      accountId: "metadata-account",
      accountLabel: "Metadata account",
      sessionId: "metadata-session",
    });
  });

  it("executes research through the RESEARCH model without an ACP coding session", async () => {
    const official = createOfficialOrchestratorTestFixture();
    const created = await official.service.createTask({
      title: "Research sources",
      goal: "Find primary sources",
      kind: "research",
      metadata: { preserved: "value" },
    });
    const spawn = vi.spyOn(official.service, "spawnAgentForTask");
    const update = vi.spyOn(official.service, "updateTask");
    const validate = vi.spyOn(official.service, "validateTask");
    const useModel = vi.fn(async (modelType: unknown) => {
      expect(modelType).toBe(ModelType.RESEARCH);
      const current = await official.service.getTask(created.id);
      await official.service.updateTask(created.id, {
        metadata: {
          ...current?.metadata,
          operatorNote: "added while researching",
        },
      });
      return {
        id: "research-response-1",
        text: "Primary sources confirm the behavior.",
        annotations: [
          { url: "https://example.test/source", title: "Primary source" },
          { url: "https://example.test/source", title: "Duplicate source" },
        ],
      };
    });
    const runtime = {
      ...official.runtime,
      getModel: (modelType: unknown) =>
        modelType === ModelType.RESEARCH
          ? () => Promise.resolve({})
          : undefined,
      useModel,
    };

    await expect(
      executeEffectiveDelegationTask(runtime as never, undefined, created.id),
    ).resolves.toMatchObject({ id: created.id, status: "completed" });

    expect(useModel).toHaveBeenCalledWith(
      ModelType.RESEARCH,
      expect.objectContaining({ tools: [{ type: "web_search_preview" }] }),
    );
    expect(spawn).not.toHaveBeenCalled();
    expect(update).toHaveBeenNthCalledWith(
      1,
      created.id,
      expect.objectContaining({
        status: "active",
        metadata: expect.objectContaining({
          researchRun: expect.objectContaining({ status: "active" }),
        }),
      }),
    );
    expect(update).toHaveBeenNthCalledWith(
      3,
      created.id,
      expect.objectContaining({
        status: "validating",
        metadata: expect.objectContaining({
          researchRun: expect.objectContaining({ status: "completed" }),
        }),
      }),
    );
    expect(validate).toHaveBeenCalledWith(
      created.id,
      expect.objectContaining({
        verifier: "doolittle-research-executor",
        humanOverride: false,
        evidence: expect.stringContaining("https://example.test/source"),
      }),
    );
    const durable = await official.service.getTask(created.id);
    expect(durable?.metadata).toMatchObject({
      preserved: "value",
      operatorNote: "added while researching",
      researchRun: {
        status: "completed",
        responseId: "research-response-1",
        sources: [{ url: "https://example.test/source" }],
      },
    });
    expect(durable?.messages).toEqual([
      expect.objectContaining({
        senderKind: "system",
        content: expect.stringContaining("Starting"),
      }),
      expect.objectContaining({
        senderKind: "sub_agent",
        content: expect.stringContaining("Sources:"),
      }),
    ]);
  });

  it("records an unavailable research provider as failed without falsely completing the task", async () => {
    const official = createOfficialOrchestratorTestFixture();
    const created = await official.service.createTask({
      title: "Research unavailable",
      goal: "Find sources",
      metadata: { capabilityProfile: "research" },
    });
    const spawn = vi.spyOn(official.service, "spawnAgentForTask");
    const validate = vi.spyOn(official.service, "validateTask");
    const runtime = {
      ...official.runtime,
      getModel: () => undefined,
      useModel: vi.fn(),
    };

    await expect(
      executeEffectiveDelegationTask(runtime as never, undefined, created.id),
    ).resolves.toMatchObject({ id: created.id, status: "failed" });

    expect(spawn).not.toHaveBeenCalled();
    expect(validate).not.toHaveBeenCalled();
    const durable = await official.service.getTask(created.id);
    expect(durable).toMatchObject({
      status: "failed",
      closedAt: expect.any(String),
    });
    expect(durable?.metadata).toMatchObject({
      researchRun: { status: "failed" },
    });
    expect(durable?.messages.at(-1)).toMatchObject({
      senderKind: "system",
      content: expect.stringContaining("no RESEARCH model"),
    });
  });

  it("deduplicates simultaneous execution of the same research task", async () => {
    const official = createOfficialOrchestratorTestFixture();
    const created = await official.service.createTask({
      title: "One research run",
      goal: "Spend provider work once",
      kind: "research",
    });
    const pending = deferred<{ id: string; text: string }>();
    const useModel = vi.fn(() => pending.promise);
    const runtime = {
      ...official.runtime,
      getModel: () => () => Promise.resolve({}),
      useModel,
    };

    const executions = Array.from({ length: 5 }, () =>
      executeEffectiveDelegationTask(runtime as never, undefined, created.id),
    );
    await vi.waitFor(() => expect(useModel).toHaveBeenCalledOnce());
    pending.resolve({ id: "single-response", text: "One report." });

    await expect(Promise.all(executions)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.id, status: "completed" }),
      ]),
    );
    expect(useModel).toHaveBeenCalledOnce();
  });

  it("does not restart a completed research task", async () => {
    const official = createOfficialOrchestratorTestFixture();
    const created = await official.service.createTask({
      title: "Completed research",
      goal: "Do not run twice",
      kind: "research",
    });
    await official.service.updateTask(created.id, { status: "done" });
    const useModel = vi.fn();
    const runtime = {
      ...official.runtime,
      getModel: () => () => Promise.resolve({}),
      useModel,
    };

    await expect(
      executeEffectiveDelegationTask(runtime as never, undefined, created.id),
    ).resolves.toMatchObject({ id: created.id, status: "completed" });
    expect(useModel).not.toHaveBeenCalled();
  });

  it("records an ordinary RESEARCH provider failure without validating the task", async () => {
    const official = createOfficialOrchestratorTestFixture();
    const created = await official.service.createTask({
      title: "Research provider failure",
      goal: "Find sources",
      kind: "research",
    });
    const validate = vi.spyOn(official.service, "validateTask");
    const runtime = {
      ...official.runtime,
      getModel: () => () => Promise.resolve({}),
      useModel: vi.fn(async () => {
        throw new Error("research provider timed out");
      }),
    };

    await expect(
      executeEffectiveDelegationTask(runtime as never, undefined, created.id),
    ).resolves.toMatchObject({ id: created.id, status: "failed" });

    expect(validate).not.toHaveBeenCalled();
    const durable = await official.service.getTask(created.id);
    expect(durable?.metadata).toMatchObject({
      researchRun: expect.objectContaining({
        status: "failed",
        error: "research provider timed out",
      }),
    });
    expect(durable?.messages.at(-1)).toMatchObject({
      content: "Doolittle research failed: research provider timed out",
    });
  });

  it("surfaces a null durable research-start update instead of hiding setup failure", async () => {
    const official = createOfficialOrchestratorTestFixture();
    const created = await official.service.createTask({
      title: "Unavailable research start",
      goal: "Find sources",
      kind: "research",
    });
    vi.spyOn(official.service, "updateTask").mockResolvedValueOnce(null);
    const runtime = {
      ...official.runtime,
      getModel: () => () => Promise.resolve({}),
      useModel: vi.fn(),
    };

    await expect(
      executeEffectiveDelegationTask(runtime as never, undefined, created.id),
    ).rejects.toThrow(
      "Unable to start Doolittle research: the durable task record was not activated.",
    );
    expect(runtime.useModel).not.toHaveBeenCalled();
    expect(await official.service.getTask(created.id)).toMatchObject({
      status: "open",
      metadata: {},
    });
  });

  it("surfaces a rejected durable research-start update", async () => {
    const official = createOfficialOrchestratorTestFixture();
    const created = await official.service.createTask({
      title: "Rejected research start",
      goal: "Find sources",
      kind: "research",
    });
    vi.spyOn(official.service, "updateTask").mockRejectedValueOnce(
      new Error("task store unavailable"),
    );
    const runtime = {
      ...official.runtime,
      getModel: () => () => Promise.resolve({}),
      useModel: vi.fn(),
    };

    await expect(
      executeEffectiveDelegationTask(runtime as never, undefined, created.id),
    ).rejects.toThrow("task store unavailable");
    expect(runtime.useModel).not.toHaveBeenCalled();
    expect(await official.service.getTask(created.id)).toMatchObject({
      status: "open",
      metadata: {},
    });
  });

  it("does not claim citations when research returns no sources", async () => {
    const official = createOfficialOrchestratorTestFixture();
    const created = await official.service.createTask({
      title: "Research without citations",
      goal: "Summarize a configured source",
      kind: "research",
    });
    const validate = vi.spyOn(official.service, "validateTask");
    const runtime = {
      ...official.runtime,
      getModel: () => () => Promise.resolve({}),
      useModel: vi.fn(async () => ({
        id: "research-response-empty",
        text: "Summary.",
      })),
    };

    await executeEffectiveDelegationTask(
      runtime as never,
      undefined,
      created.id,
    );

    expect(validate).toHaveBeenCalledWith(
      created.id,
      expect.objectContaining({ summary: "Doolittle research completed." }),
    );
  });

  it("keeps a cancelled sessionless research run cancelled when the provider resolves late", async () => {
    const official = createOfficialOrchestratorTestFixture();
    const created = await official.service.createTask({
      title: "Cancelable research",
      goal: "Find sources slowly",
      kind: "research",
    });
    const pending = deferred<{
      id: string;
      text: string;
      annotations?: Array<{ url: string; title: string }>;
    }>();
    const useModel = vi.fn(
      (_modelType: unknown, _params: unknown) => pending.promise,
    );
    const runtime = {
      ...official.runtime,
      getModel: () => () => Promise.resolve({}),
      useModel,
    };

    const execution = executeEffectiveDelegationTask(
      runtime as never,
      undefined,
      created.id,
    );
    await vi.waitFor(() => expect(useModel).toHaveBeenCalledOnce());
    const params = useModel.mock.calls[0]?.[1] as
      | { signal?: AbortSignal }
      | undefined;
    const signal = params?.signal;
    expect(signal?.aborted).toBe(false);
    await expect(
      cancelEffectiveDelegationTask(
        runtime as never,
        undefined,
        created.id,
        "Operator stopped this run.",
      ),
    ).resolves.toMatchObject({ id: created.id, status: "cancelled" });
    expect(signal?.aborted).toBe(true);

    pending.resolve({
      id: "late-response",
      text: "This must not be recorded.",
    });
    await expect(execution).resolves.toMatchObject({
      id: created.id,
      status: "cancelled",
    });

    const durable = await official.service.getTask(created.id);
    expect(durable).toMatchObject({ status: "interrupted", paused: true });
    expect(durable?.metadata).toMatchObject({
      researchRun: expect.objectContaining({
        status: "cancelled",
        interruption: "cooperative",
        providerAbortRequested: true,
      }),
    });
    expect(durable?.messages.map((message) => message.content)).not.toContain(
      "This must not be recorded.",
    );
    expect(
      durable?.messages.map((message) => message.content).join("\n"),
    ).not.toContain("Doolittle research failed:");
    expect(durable?.summary).toBeUndefined();
  });

  it("does not overwrite a research task when an operator replaces its run id", async () => {
    const official = createOfficialOrchestratorTestFixture();
    const created = await official.service.createTask({
      title: "Superseded research",
      goal: "Find sources",
      kind: "research",
    });
    const pending = deferred<{ id: string; text: string }>();
    const useModel = vi.fn(() => pending.promise);
    const runtime = {
      ...official.runtime,
      getModel: () => () => Promise.resolve({}),
      useModel,
    };
    const execution = executeEffectiveDelegationTask(
      runtime as never,
      undefined,
      created.id,
    );
    await vi.waitFor(() => expect(useModel).toHaveBeenCalledOnce());
    const active = await official.service.getTask(created.id);
    await official.service.updateTask(created.id, {
      metadata: {
        ...active?.metadata,
        researchRun: {
          runId: "operator-replacement",
          status: "active",
          startedAt: "2026-08-09T00:00:00.000Z",
        },
      },
    });

    pending.resolve({ id: "superseded-response", text: "Do not emit this." });
    await expect(execution).resolves.toMatchObject({
      id: created.id,
      status: "running",
    });
    const durable = await official.service.getTask(created.id);
    expect(durable?.metadata).toMatchObject({
      researchRun: { runId: "operator-replacement", status: "active" },
    });
    expect(
      durable?.messages.map((message) => message.content).join("\n"),
    ).not.toContain("Do not emit this.");
  });

  it("reconciles stale sessionless research receipts on the first delegation list refresh", async () => {
    const official = createOfficialOrchestratorTestFixture();
    const created = await official.service.createTask({
      title: "Stale research",
      goal: "Find sources",
      kind: "research",
      metadata: {
        researchRun: {
          runId: "stale-research-run",
          status: "active",
          startedAt: "2026-08-09T00:00:00.000Z",
        },
      },
    });
    await official.service.updateTask(created.id, { status: "active" });
    const listTasks = vi.spyOn(official.service, "listTasks");
    const getTask = vi.spyOn(official.service, "getTask");

    await expect(
      getEffectiveDelegationTasks(official.runtime as never),
    ).resolves.toEqual([
      expect.objectContaining({ id: created.id, status: "cancelled" }),
    ]);
    expect(listTasks).toHaveBeenCalledOnce();
    expect(getTask).toHaveBeenCalledTimes(1);
    const durable = await official.service.getTask(created.id);
    expect(durable).toMatchObject({ status: "interrupted" });
    expect(durable?.metadata).toMatchObject({
      researchRun: expect.objectContaining({
        status: "interrupted",
        interruption: "reconciled-after-restart",
      }),
    });
  });

  it("does not reconcile a live in-process research run during a list refresh", async () => {
    const official = createOfficialOrchestratorTestFixture();
    const created = await official.service.createTask({
      title: "Live research",
      goal: "Find sources slowly",
      kind: "research",
    });
    const pending = deferred<{ id: string; text: string }>();
    const useModel = vi.fn(() => pending.promise);
    const runtime = {
      ...official.runtime,
      getModel: () => () => Promise.resolve({}),
      useModel,
    };
    const execution = executeEffectiveDelegationTask(
      runtime as never,
      undefined,
      created.id,
    );
    await vi.waitFor(() => expect(useModel).toHaveBeenCalledOnce());

    await expect(
      getEffectiveDelegationTasks(runtime as never),
    ).resolves.toEqual([
      expect.objectContaining({ id: created.id, status: "running" }),
    ]);
    expect(await official.service.getTask(created.id)).toMatchObject({
      status: "active",
    });

    pending.resolve({ id: "live-response", text: "Live report." });
    await expect(execution).resolves.toMatchObject({ status: "completed" });
  });

  it("does not reconcile research while its start message is still being persisted", async () => {
    const official = createOfficialOrchestratorTestFixture();
    const created = await official.service.createTask({
      title: "Starting research",
      goal: "Find sources slowly",
      kind: "research",
    });
    const releaseStartMessage = deferred<void>();
    const addMessage = official.service.addMessage.bind(official.service);
    vi.spyOn(official.service, "addMessage").mockImplementation(
      async (taskId, input) => {
        if (input.content.startsWith("Starting Doolittle research run")) {
          await releaseStartMessage.promise;
        }
        return addMessage(taskId, input);
      },
    );
    const useModel = vi.fn(async () => ({
      id: "started-response",
      text: "Started report.",
    }));
    const runtime = {
      ...official.runtime,
      getModel: () => () => Promise.resolve({}),
      useModel,
    };
    const execution = executeEffectiveDelegationTask(
      runtime as never,
      undefined,
      created.id,
    );
    await vi.waitFor(() =>
      expect(official.service.addMessage).toHaveBeenCalledWith(
        created.id,
        expect.objectContaining({
          content: expect.stringContaining("Starting Doolittle research run"),
        }),
      ),
    );

    await expect(
      getEffectiveDelegationTasks(runtime as never),
    ).resolves.toEqual([
      expect.objectContaining({ id: created.id, status: "running" }),
    ]);
    expect(await official.service.getTask(created.id)).toMatchObject({
      status: "active",
    });
    expect(useModel).not.toHaveBeenCalled();

    releaseStartMessage.resolve();
    await expect(execution).resolves.toMatchObject({ status: "completed" });
  });

  it("does not alter active coding tasks during sessionless research reconciliation", async () => {
    const official = createOfficialOrchestratorTestFixture();
    const created = await official.service.createTask({
      title: "Active coding",
      goal: "Edit source",
      kind: "coding",
    });
    await official.service.updateTask(created.id, { status: "active" });

    await getEffectiveDelegationTasks(official.runtime as never);
    expect(await official.service.getTask(created.id)).toMatchObject({
      status: "active",
      paused: false,
    });
  });

  it("continues to spawn ACP coding sessions for coding tasks", async () => {
    const official = createOfficialOrchestratorTestFixture();
    const created = await official.service.createTask({
      title: "Implement a feature",
      goal: "Edit source code",
      kind: "coding",
    });
    const spawn = vi.spyOn(official.service, "spawnAgentForTask");
    const runtime = { ...official.runtime };

    await executeEffectiveDelegationTask(
      runtime as never,
      undefined,
      created.id,
    );

    expect(spawn).toHaveBeenCalledWith(created.id, {
      workdir: undefined,
      framework: undefined,
    });
  });
});
