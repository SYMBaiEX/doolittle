import type {
  DelegationOrchestrationMode,
  DelegationTaskRecord,
} from "@/types";
import type {
  DelegationAggregationSummary,
  DelegationOverview,
  DelegationTaskFilter,
} from "./read-model";

export interface DelegationCreateInput {
  title: string;
  objective: string;
  group?: string;
  profile?: string;
  priority?: "low" | "normal" | "high";
  tags?: string[];
  labels?: string[];
  metadata?: Record<string, string>;
  parentTaskId?: string;
  executionMode?: "local" | "delegated";
  orchestrationMode?: DelegationOrchestrationMode;
  maxAttempts?: number;
}

export interface DelegationWorkerStartInput {
  pid?: number;
  mode?: "inline" | "process";
  outputPath?: string;
}

export interface DelegationSupervisionReport {
  concurrency: number;
  started: string[];
  completed: string[];
  failed: { id: string; error: string }[];
  skipped: { id: string; reason: string }[];
  aggregations: DelegationAggregationSummary[];
  overview: DelegationOverview;
}

export interface DelegationMutationContext {
  read(): { tasks: DelegationTaskRecord[] };
  write(store: { tasks: DelegationTaskRecord[] }): void;
  emitUpdate(kind: "created" | "updated", task: DelegationTaskRecord): void;
}

export interface DelegationSupervisionOptions {
  concurrency?: number;
  filter?: DelegationTaskFilter;
  onComplete?: (task: DelegationTaskRecord) => Promise<void> | void;
  onError?: (task: DelegationTaskRecord, error: string) => Promise<void> | void;
}

export interface DelegationExecutionOptions {
  concurrency?: number;
  filter?: DelegationTaskFilter;
  onComplete?: (task: DelegationTaskRecord) => Promise<void> | void;
}
