import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DOOLITTLE_OPERATOR_PLANNING_SERVICE,
  ORCHESTRATOR_TASK_SERVICE,
} from "@doolittle/contracts";
import type { IAgentRuntime, Service, ServiceClass } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { createPlanningPlugin } from "./index";

describe("plugin-planning", () => {
  it("creates and summarizes persisted plans", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-planning-"));
    const plugin = createPlanningPlugin({
      storage: {
        dataRoot: root,
      },
    });
    const PlanningService = plugin.services?.[0] as ServiceClass;
    expect(PlanningService).toBeDefined();
    const service = (await PlanningService.start(
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
    });
    expect(PlanningService.serviceType).toBe(
      DOOLITTLE_OPERATOR_PLANNING_SERVICE,
    );
    expect(PlanningService.serviceType).not.toBe("planning");
  });

  it("approves drafts and steers linked tasks through the official orchestrator", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-planning-reviewed-"));
    const messages: Array<{ id: string; content: string }> = [];
    let taskStatus = "open";
    const orchestrator = {
      getTask: async () => ({ status: taskStatus, paused: false }),
      addMessage: async (id: string, input: { content: string }) => {
        messages.push({ id, content: input.content });
        return true;
      },
    };
    const runtime = {
      getService: (serviceType: string) =>
        serviceType === ORCHESTRATOR_TASK_SERVICE ? orchestrator : null,
    } as unknown as IAgentRuntime;
    const plugin = createPlanningPlugin({
      storage: { dataRoot: root },
    });
    const PlanningService = plugin.services?.[0] as ServiceClass;
    const service = (await PlanningService.start(runtime)) as Service & {
      createPlan(
        input: unknown,
      ): Promise<{ id: string; metadata: Record<string, unknown> }>;
      approvePlan(id: string): Promise<{
        kind: string;
        plan?: { status: string; metadata: Record<string, unknown> };
      }>;
      steerPlan(
        id: string,
        instruction: string,
      ): Promise<{ kind: string; plan?: { id: string }; taskId?: string }>;
    };
    const draft = await service.createPlan({
      title: "Reviewed plan",
      objective: "Wait for operator review.",
      status: "draft",
      taskId: "task-1",
      metadata: { preserved: true },
    });

    const approved = await service.approvePlan(draft.id);
    expect(approved).toMatchObject({
      kind: "approved",
      plan: {
        status: "active",
        metadata: {
          preserved: true,
          operatorReview: { action: "approved" },
        },
      },
    });
    expect(await service.steerPlan(draft.id, "Keep the diff focused.")).toEqual(
      {
        kind: "steered",
        plan: expect.objectContaining({ id: draft.id }),
        taskId: "task-1",
      },
    );
    expect(messages).toEqual([
      {
        id: "task-1",
        content: "operator-steer: Keep the diff focused.",
      },
    ]);

    taskStatus = "done";
    expect(await service.steerPlan(draft.id, "Too late.")).toMatchObject({
      kind: "task_not_steerable",
    });
  });
});
