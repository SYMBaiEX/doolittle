import { join } from "node:path";
import type { StoredPlanRecord } from "@doolittle/contracts";
import { Service as ElizaService, type IAgentRuntime } from "@elizaos/core";
import {
  normalizeMetadata,
  normalizeStatus,
  normalizeSteps,
  normalizeText,
} from "./normalization";
import { ensureStoreInitialized, readStore, writeStore } from "./storage";
import type { PlanningPluginOptions, PlanningStore } from "./types";
import { nextId, nowIso } from "./utils";

type PlanningDependencyProvider = Pick<
  PlanningPluginOptions,
  "delegation" | "workflows"
>;

export const createPlanningService = (
  storageRoot: string,
  options: PlanningDependencyProvider,
) => {
  class PlanningService extends ElizaService {
    static serviceType = "planning";

    capabilityDescription =
      "Workspace-native planning service for native execution, delegation, and workflow graph coordination.";

    private readonly rootDir = storageRoot;
    private readonly storePath = join(this.rootDir, "plans-store.json");

    constructor(runtime?: IAgentRuntime) {
      super(runtime);
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
        delegationTasks: options.delegation.list().length,
        workflows: options.workflows.list(50).length,
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

    private readStore(): PlanningStore {
      return readStore(this.storePath);
    }

    private writeStore(store: PlanningStore): void {
      writeStore(this.storePath, store);
    }
  }

  return PlanningService;
};
