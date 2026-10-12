import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runWithConversationWorkspace } from "@/runtime/workspace-scope";
import {
  createEffectiveDelegationTask,
  executeEffectiveDelegationTask,
  retryEffectiveDelegationTask,
  spawnEffectiveDelegationChild,
} from "./write";

const { requestWorkerHost } = vi.hoisted(() => ({
  requestWorkerHost: vi.fn(),
}));
vi.mock("@/runtime/bootstrap/worker-host-rpc", () => ({ requestWorkerHost }));

let directory: string;
beforeEach(() => {
  vi.stubEnv("DOOLITTLE_DESKTOP_RUNTIME", "1");
  directory = realpathSync(
    mkdtempSync(join(tmpdir(), "doolittle-task-scope-")),
  );
  requestWorkerHost.mockImplementation(async (operation, payload) =>
    operation === "execution.claim"
      ? { accepted: true, leaseId: randomUUID() }
      : operation === "execution.release"
        ? { released: true }
        : { ...scope(), sessionId: payload.sessionId },
  );
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
function scope() {
  return {
    sessionId: "chat-1",
    botId: "lead",
    workspacePath: directory,
    projectId: "project-1",
  };
}
function detail(metadata: Record<string, unknown>) {
  return {
    id: "task-1",
    title: "Scoped task",
    goal: "Bound work",
    kind: "coding",
    status: "active",
    priority: "normal",
    paused: false,
    metadata,
    createdAt: "2026-10-12T00:00:00Z",
    updatedAt: "2026-10-12T00:00:00Z",
    sessions: [],
    messages: [],
    events: [],
  };
}
function fixture(
  metadata = {
    workspaceRoot: directory,
    doolittleWorkspaceScope: scope(),
  } as Record<string, unknown>,
) {
  const task = detail(metadata);
  const service = {
    createTask: vi.fn(async () => task),
    getTask: vi.fn(async () => task),
    spawnAgentForTask: vi.fn(async () => task),
    retryTaskTurn: vi.fn(async () => task),
  };
  const runtime = { getService: () => service } as never;
  return { service, runtime };
}

describe("durable task workspace grants", () => {
  it("freezes the host scope at creation and rejects rootless or different-root tasks", async () => {
    const { runtime, service } = fixture();
    const input = {
      title: "Task",
      objective: "Bound work",
      metadata: { doolittleWorkspaceScope: "forged" },
    };
    await expect(
      createEffectiveDelegationTask(runtime, undefined, input),
    ).rejects.toThrow("bound conversation");
    await runWithConversationWorkspace(scope(), async () => {
      await createEffectiveDelegationTask(runtime, undefined, input);
      await expect(
        createEffectiveDelegationTask(runtime, undefined, {
          ...input,
          workspaceRoot: "/unapproved",
        }),
      ).rejects.toThrow("explicitly approved");
    });
    expect(service.createTask).toHaveBeenCalledOnce();
    expect(service.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          workspaceRoot: directory,
          doolittleWorkspaceScope: scope(),
        }),
      }),
    );
  });

  it("revalidates the original grant before invoking the official SDK spawn", async () => {
    const { runtime, service } = fixture();
    await runWithConversationWorkspace(scope(), async () => {
      await executeEffectiveDelegationTask(runtime, undefined, "task-1");
      await retryEffectiveDelegationTask(runtime, undefined, "task-1");
      expect(service.retryTaskTurn).toHaveBeenCalledWith("task-1", {
        instruction: "Retry this task from its durable context.",
        mode: "new-session",
      });
      expect(service.spawnAgentForTask).toHaveBeenCalledWith("task-1", {
        workdir: undefined,
        framework: undefined,
      });
      requestWorkerHost.mockRejectedValue(new Error("Project grant revoked"));
      await expect(
        executeEffectiveDelegationTask(runtime, undefined, "task-1"),
      ).rejects.toThrow("revoked");
    });
    expect(service.spawnAgentForTask).toHaveBeenCalledOnce();
  });

  it("denies cross-project execute, retry, and child creation before SDK effects", async () => {
    const { runtime, service } = fixture();
    await runWithConversationWorkspace(
      { ...scope(), projectId: "project-2" },
      async () => {
        await expect(
          executeEffectiveDelegationTask(runtime, undefined, "task-1"),
        ).rejects.toThrow("does not match");
        await expect(
          retryEffectiveDelegationTask(runtime, undefined, "task-1"),
        ).rejects.toThrow("does not match");
        await expect(
          spawnEffectiveDelegationChild(runtime, undefined, "task-1", {
            title: "Child",
            objective: "Bound work",
          }),
        ).rejects.toThrow("does not match");
      },
    );
    expect(service.spawnAgentForTask).not.toHaveBeenCalled();
    expect(service.retryTaskTurn).not.toHaveBeenCalled();
    expect(service.createTask).not.toHaveBeenCalled();
  });

  it("does not infer a grant for historical root-only task receipts", async () => {
    const { runtime, service } = fixture({ workspaceRoot: directory });
    await runWithConversationWorkspace(scope(), async () => {
      await expect(
        executeEffectiveDelegationTask(runtime, undefined, "task-1"),
      ).rejects.toThrow("new confirmed");
    });
    expect(service.spawnAgentForTask).not.toHaveBeenCalled();
  });
});
