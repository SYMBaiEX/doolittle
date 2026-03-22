import { describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IAgentRuntime, Service, ServiceClass } from "@elizaos/core";
import { createPlanningPlugin } from "./index";

describe("plugin-planning", () => {
  it("creates and summarizes persisted plans", async () => {
    const cwd = process.cwd();
    const root = mkdtempSync(join(tmpdir(), "eliza-planning-"));
    process.chdir(root);
    try {
      const plugin = createPlanningPlugin({
        delegation: {
          list: () => [{ id: "task-1" }],
          get: (id) => ({ id }),
        },
        workflows: {
          list: () => [{ id: "workflow-1" }],
          get: (id) => ({ id }),
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
    } finally {
      process.chdir(cwd);
    }
  });
});
