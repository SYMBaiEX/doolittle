import { describe, expect, it, vi } from "vitest";
import {
  createEffectiveDelegationTask,
  getEffectiveDelegationTask,
  getEffectiveDelegationTasks,
  OrchestratorTaskServiceUnavailableError,
  projectOfficialTask,
  superviseEffectiveDelegationQueue,
} from ".";

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
});
