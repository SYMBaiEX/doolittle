import { describe, expect, it } from "vitest";
import type { AgentExecutionContext } from "../chat";
import { handleDelegationCommand } from "./delegation-commands";

function detail() {
  return {
    id: "task-1",
    title: "Official task",
    kind: "coding",
    status: "open",
    priority: "normal",
    paused: false,
    originalRequest: "Official goal",
    sessionCount: 0,
    activeSessionCount: 0,
    latestSessionId: null,
    latestWorkdir: null,
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
    closedAt: null,
    goal: "Official goal",
    parentTaskId: null,
    acceptanceCriteria: [],
    providerPolicy: null,
    metadata: {},
    sessions: [],
    messages: [],
    events: [],
  };
}

function contextWithOfficialService(): AgentExecutionContext {
  const service = {
    listTasks: async () => [detail()],
    getTask: async () => detail(),
    getStatus: async () => ({
      taskCount: 1,
      activeTaskCount: 0,
      pausedTaskCount: 0,
      blockedTaskCount: 0,
      validatingTaskCount: 0,
      sessionCount: 0,
      activeSessionCount: 0,
      byStatus: {},
    }),
    createTask: async () => detail(),
  };
  return {
    runtime: {
      getService: (name: string) =>
        name === "ORCHESTRATOR_TASK_SERVICE" ? service : null,
    },
    services: {},
  } as unknown as AgentExecutionContext;
}

const options = {
  runDelegationTaskInWorker: async () => detail(),
};

describe("delegation command router", () => {
  it("renders official tasks through the legacy CLI model", async () => {
    const response = await handleDelegationCommand(
      "/delegate list",
      contextWithOfficialService(),
      options,
    );
    expect(response).toContain('"id": "task-1"');
    expect(response).toContain('"executionMode": "delegated"');
  });

  it("creates tasks through the official service", async () => {
    const response = await handleDelegationCommand(
      "/delegate create Parent :: Official goal",
      contextWithOfficialService(),
      options,
    );
    expect(response).toContain('"id": "task-1"');
  });

  it("returns a clear unavailable state instead of using a local store", async () => {
    const response = await handleDelegationCommand(
      "/delegate list",
      {
        runtime: { getService: () => null },
        services: {},
      } as never,
      options,
    );
    expect(response).toContain("ORCHESTRATOR_TASK_SERVICE_UNAVAILABLE");
  });
});
