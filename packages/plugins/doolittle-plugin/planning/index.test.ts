import { describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IAgentRuntime, Service, ServiceClass } from "@elizaos/core";
import { createPlanningPlugin } from "./index";

describe("plugin-planning", () => {
  it("creates and summarizes persisted plans", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-planning-"));
    const plugin = createPlanningPlugin({
      delegation: {
        list: () => [
          {
            id: "task-1",
            title: "Task 1",
            objective: "Do task 1",
            status: "pending",
            executionMode: "local",
            notes: [],
            createdAt: "2026-03-24T00:00:00.000Z",
            updatedAt: "2026-03-24T00:00:00.000Z",
          },
        ],
        get: (id) => ({
          id,
          title: "Task 1",
          objective: "Do task 1",
          status: "pending",
          executionMode: "local",
          notes: [],
          createdAt: "2026-03-24T00:00:00.000Z",
          updatedAt: "2026-03-24T00:00:00.000Z",
        }),
      },
      workflows: {
        list: () => [
          {
            id: "workflow-1",
            createdAt: "2026-03-24T00:00:00.000Z",
            updatedAt: "2026-03-24T00:00:00.000Z",
            startedAt: "2026-03-24T00:00:00.000Z",
            title: "Workflow 1",
            objective: "Ship workflow 1",
            kind: "generate",
            status: "running",
            runIds: [],
            artifactPaths: [],
          },
        ],
        get: (id) => ({
          id,
          createdAt: "2026-03-24T00:00:00.000Z",
          updatedAt: "2026-03-24T00:00:00.000Z",
          startedAt: "2026-03-24T00:00:00.000Z",
          title: "Workflow 1",
          objective: "Ship workflow 1",
          kind: "generate",
          status: "running",
          runIds: [],
          artifactPaths: [],
        }),
      },
      storage: {
        dataRoot: root,
      },
    });
    const PlanningService = plugin.services?.[0] as ServiceClass | undefined;
    expect(PlanningService).toBeDefined();
    const service = (await PlanningService?.start(
      undefined as unknown as IAgentRuntime,
    )) as Service & {
      createPlan(input: unknown): Promise<unknown>;
      listPlans(): unknown[];
      summary(): Record<string, unknown>;
    };
    const plan = (await service.createPlan({
      title: "Ship native planning",
      objective: "Integrate planning across runtime surfaces.",
      taskId: "task-1",
      workflowId: "workflow-1",
    })) as {
      title: string;
      taskId?: string;
      workflowId?: string;
    };

    expect(plan.title).toBe("Ship native planning");
    expect(plan.taskId).toBe("task-1");
    expect(plan.workflowId).toBe("workflow-1");
    expect(service.listPlans()).toHaveLength(1);

    expect(service.summary()).toMatchObject({
      total: 1,
      linkedTasks: 1,
      linkedWorkflows: 1,
      delegationTasks: 1,
      workflows: 1,
    });
  });
});
