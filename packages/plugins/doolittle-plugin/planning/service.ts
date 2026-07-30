import { join } from "node:path";
import {
  DOOLITTLE_OPERATOR_PLANNING_SERVICE,
  ORCHESTRATOR_TASK_SERVICE,
  type StoredPlanRecord,
} from "@doolittle/contracts";
import { Service as ElizaService, type IAgentRuntime } from "@elizaos/core";
import {
  normalizeMetadata,
  normalizeStatus,
  normalizeSteps,
  normalizeText,
} from "./normalization";
import { ensureStoreInitialized, readStore, writeStore } from "./storage";
import type { PlanningStore } from "./types";
import { nextId, nowIso } from "./utils";

export type PlanApprovalResult =
  | { kind: "approved"; plan: StoredPlanRecord }
  | { kind: "not_found" }
  | { kind: "invalid_state"; plan: StoredPlanRecord };

export type PlanSteeringResult =
  | { kind: "steered"; plan: StoredPlanRecord; taskId: string }
  | { kind: "not_found" }
  | { kind: "invalid_state"; plan: StoredPlanRecord }
  | { kind: "unlinked"; plan: StoredPlanRecord }
  | { kind: "task_not_found"; plan: StoredPlanRecord; taskId: string }
  | { kind: "invalid_instruction"; plan: StoredPlanRecord }
  | {
      kind: "task_not_steerable";
      plan: StoredPlanRecord;
      taskId: string;
      status: unknown;
    }
  | { kind: "orchestrator_unavailable"; plan: StoredPlanRecord };

interface OrchestratorTask {
  status?: unknown;
  paused?: unknown;
}

interface OrchestratorTaskService {
  getTask(id: string): Promise<OrchestratorTask | null>;
  addMessage(
    id: string,
    input: {
      content: string;
      senderKind: "orchestrator";
      direction: "system";
    },
  ): Promise<boolean>;
}

const STEERABLE_TASK_STATUSES = new Set([
  "open",
  "active",
  "waiting_on_user",
  "blocked",
]);

export const createPlanningService = (storageRoot: string) => {
  class PlanningService extends ElizaService {
    static serviceType = DOOLITTLE_OPERATOR_PLANNING_SERVICE;

    capabilityDescription =
      "Doolittle operator-plan projection linked to native Eliza tasks and workflow graphs.";

    private readonly rootDir = storageRoot;
    private readonly storePath = join(this.rootDir, "plans-store.json");
    private readonly agentRuntime: IAgentRuntime | undefined;

    constructor(runtime?: IAgentRuntime) {
      super(runtime);
      this.agentRuntime = runtime;
      ensureStoreInitialized(this.rootDir, this.storePath);
    }

    static async start(runtime?: IAgentRuntime): Promise<PlanningService> {
      return new PlanningService(runtime);
    }

    async stop(): Promise<void> {}

    listPlans(): StoredPlanRecord[] {
      return this.readStore().plans;
    }

    getPlan(id: string): StoredPlanRecord | undefined {
      return this.readStore().plans.find((entry) => entry.id === id);
    }

    summary() {
      const plans = this.listPlans();
      return {
        total: plans.length,
        active: plans.filter((entry) => entry.status === "active").length,
        draft: plans.filter((entry) => entry.status === "draft").length,
        completed: plans.filter((entry) => entry.status === "completed").length,
        linkedTasks: plans.filter((entry) => Boolean(entry.taskId)).length,
        linkedWorkflows: plans.filter((entry) => Boolean(entry.workflowId))
          .length,
      };
    }

    async createPlan(input: unknown): Promise<StoredPlanRecord> {
      const payload =
        input && typeof input === "object"
          ? (input as Record<string, unknown>)
          : {};
      const createdAt = nowIso();
      const plan: StoredPlanRecord = {
        id: nextId("plan"),
        title: normalizeText(payload.title, "Native execution plan"),
        objective: normalizeText(
          payload.objective,
          "Coordinate the requested work through native ElizaOS services.",
        ),
        status: normalizeStatus(payload.status),
        createdAt,
        updatedAt: createdAt,
        taskId:
          typeof payload.taskId === "string" && payload.taskId.trim()
            ? payload.taskId.trim()
            : undefined,
        workflowId:
          typeof payload.workflowId === "string" && payload.workflowId.trim()
            ? payload.workflowId.trim()
            : undefined,
        metadata: normalizeMetadata(payload.metadata),
        steps: normalizeSteps(payload.steps),
      };
      const store = this.readStore();
      store.plans.unshift(plan);
      this.writeStore(store);
      return plan;
    }

    async approvePlan(planId: string): Promise<PlanApprovalResult> {
      const store = this.readStore();
      const index = store.plans.findIndex((entry) => entry.id === planId);
      if (index === -1) {
        return { kind: "not_found" };
      }

      const plan = store.plans[index];
      if (plan.status !== "draft") {
        return { kind: "invalid_state", plan };
      }

      const approvedAt = nowIso();
      const approved: StoredPlanRecord = {
        ...plan,
        status: "active",
        updatedAt: approvedAt,
        metadata: {
          ...plan.metadata,
          operatorReview: {
            action: "approved",
            approvedAt,
            approvedBy: "desktop-operator",
          },
        },
      };
      store.plans[index] = approved;
      this.writeStore(store);
      return { kind: "approved", plan: approved };
    }

    async steerPlan(
      planId: string,
      instruction: string,
    ): Promise<PlanSteeringResult> {
      const plan = this.getPlan(planId);
      if (!plan) {
        return { kind: "not_found" };
      }
      if (plan.status !== "active") {
        return { kind: "invalid_state", plan };
      }
      const normalizedInstruction = instruction.trim();
      if (
        normalizedInstruction.length < 1 ||
        normalizedInstruction.length > 4000
      ) {
        return { kind: "invalid_instruction", plan };
      }
      if (!plan.taskId) {
        return { kind: "unlinked", plan };
      }
      const orchestrator = this.agentRuntime?.getService(
        ORCHESTRATOR_TASK_SERVICE,
      ) as OrchestratorTaskService | null | undefined;
      if (!orchestrator) {
        return { kind: "orchestrator_unavailable", plan };
      }

      let task: OrchestratorTask | null;
      try {
        task = await orchestrator.getTask(plan.taskId);
      } catch {
        return { kind: "task_not_found", plan, taskId: plan.taskId };
      }
      if (!task) {
        return { kind: "task_not_found", plan, taskId: plan.taskId };
      }
      const taskStatus = task.status;
      if (
        task.paused === true ||
        typeof taskStatus !== "string" ||
        !STEERABLE_TASK_STATUSES.has(taskStatus)
      ) {
        return {
          kind: "task_not_steerable",
          plan,
          taskId: plan.taskId,
          status: taskStatus,
        };
      }

      const added = await orchestrator.addMessage(plan.taskId, {
        content: `operator-steer: ${normalizedInstruction}`,
        senderKind: "orchestrator",
        direction: "system",
      });
      if (!added) {
        return { kind: "task_not_found", plan, taskId: plan.taskId };
      }
      return { kind: "steered", plan, taskId: plan.taskId };
    }

    private readStore(): PlanningStore {
      return readStore(this.storePath);
    }

    private writeStore(store: PlanningStore): void {
      writeStore(this.storePath, store);
    }
  }

  return PlanningService;
};
