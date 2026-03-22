import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  Service as ElizaService,
  type IAgentRuntime,
  type Plugin,
} from "@elizaos/core";

interface PlanningPluginOptions {
  delegation: {
    list(): unknown[];
    get?(id: string): unknown;
  };
  workflows: {
    list(limit?: number): unknown[];
    get?(id: string): unknown;
  };
}

interface StoredPlanRecord {
  id: string;
  title: string;
  objective: string;
  status: "draft" | "active" | "completed";
  createdAt: string;
  updatedAt: string;
  taskId?: string;
  workflowId?: string;
  metadata: Record<string, unknown>;
  steps: string[];
}

interface PlanningStore {
  plans: StoredPlanRecord[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeSteps(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [
      "Clarify scope and runtime dependencies.",
      "Execute through native ElizaOS services and plugins.",
      "Validate the result with lint, typecheck, tests, and build.",
    ];
  }
  const steps = input
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return steps.length > 0
    ? steps
    : [
        "Clarify scope and runtime dependencies.",
        "Execute through native ElizaOS services and plugins.",
        "Validate the result with lint, typecheck, tests, and build.",
      ];
}

function normalizeStatus(input: unknown): StoredPlanRecord["status"] {
  return input === "completed" || input === "draft" ? input : "active";
}

function normalizeMetadata(input: unknown): Record<string, unknown> {
  return input && typeof input === "object"
    ? { ...(input as Record<string, unknown>) }
    : {};
}

function normalizeText(input: unknown, fallback: string): string {
  return typeof input === "string" && input.trim() ? input.trim() : fallback;
}

export function createPlanningPlugin(options: PlanningPluginOptions): Plugin {
  class PlanningService extends ElizaService {
    static serviceType = "planning";

    capabilityDescription =
      "Workspace-native planning service for native execution, delegation, and workflow graph coordination.";

    private readonly rootDir = join(process.cwd(), ".eliza-agent", "planning");
    private readonly storePath = join(this.rootDir, "plans-store.json");

    constructor(runtime?: IAgentRuntime) {
      super(runtime);
      mkdirSync(this.rootDir, { recursive: true });
      if (!existsSync(this.storePath)) {
        this.writeStore({ plans: [] });
      }
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
      try {
        const parsed = JSON.parse(readFileSync(this.storePath, "utf8")) as {
          plans?: Array<Partial<StoredPlanRecord>>;
        };
        return {
          plans: Array.isArray(parsed.plans)
            ? parsed.plans
                .filter(
                  (
                    entry,
                  ): entry is Partial<StoredPlanRecord> &
                    Pick<StoredPlanRecord, "id" | "title" | "objective"> =>
                    Boolean(entry.id && entry.title && entry.objective),
                )
                .map((entry) => ({
                  id: entry.id,
                  title: entry.title,
                  objective: entry.objective,
                  status: normalizeStatus(entry.status),
                  createdAt: entry.createdAt ?? nowIso(),
                  updatedAt: entry.updatedAt ?? entry.createdAt ?? nowIso(),
                  taskId:
                    typeof entry.taskId === "string" ? entry.taskId : undefined,
                  workflowId:
                    typeof entry.workflowId === "string"
                      ? entry.workflowId
                      : undefined,
                  metadata: normalizeMetadata(entry.metadata),
                  steps: normalizeSteps(entry.steps),
                }))
            : [],
        };
      } catch {
        return { plans: [] };
      }
    }

    private writeStore(store: PlanningStore): void {
      writeFileSync(this.storePath, JSON.stringify(store, null, 2), "utf8");
    }
  }

  return {
    name: "@elizaos/plugin-planning",
    description:
      "Workspace-native planning plugin for execution plans linked to native tasks and workflows.",
    services: [PlanningService],
    providers: [],
    actions: [],
    evaluators: [],
  };
}
