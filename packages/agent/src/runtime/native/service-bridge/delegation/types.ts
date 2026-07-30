import type { DelegationTaskRecord } from "@/types";
import type { DelegationOrchestrationMode } from "@/types/runtime";

export interface EffectiveDelegationCreateInput {
  title: string;
  objective: string;
  metadata?: Record<string, unknown>;
  workspaceRoot?: string;
  group?: string;
  profile?: string;
  priority?: "low" | "normal" | "high";
  labels?: string[];
  tags?: string[];
  executionMode?: "local" | "delegated";
  orchestrationMode?: DelegationOrchestrationMode;
  maxAttempts?: number;
}

/**
 * Product-facing synchronous read model for official orchestrator tasks.
 *
 * Lifecycle mutations remain owned by ORCHESTRATOR_TASK_SERVICE. The bridge
 * only writes projected task results here so synchronous desktop/TUI
 * renderers can reflect a completed official mutation immediately.
 */
export interface DelegationProjection {
  upsertProjection(task: DelegationTaskRecord): void;
}
