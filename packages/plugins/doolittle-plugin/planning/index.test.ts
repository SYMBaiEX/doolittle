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
        addNote: (_id, _note) => undefined,
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

  it("approves drafts with an operator receipt and steers only pending linked tasks", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-planning-reviewed-"));
    const notes: string[] = [];
    let taskStatus = "pending";
    const plugin = createPlanningPlugin({
      delegation: {
        list: () => [],
        get: () => ({ status: taskStatus }),
        addNote: (_id, note) => notes.push(note),
      },
      workflows: { list: () => [] },
      storage: { dataRoot: root },
    });
    const PlanningService = plugin.services?.[0] as ServiceClass;
    const service = (await PlanningService.start(
      undefined as unknown as IAgentRuntime,
    )) as Service & {
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
    expect(notes).toEqual(["operator-steer: Keep the diff focused."]);

    taskStatus = "running";
    expect(await service.steerPlan(draft.id, "Too late.")).toMatchObject({
      kind: "task_not_pending",
    });
  });
});
