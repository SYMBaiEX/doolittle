import type { DelegationOrchestrationMode } from "./runtime/primitives";

export interface DelegationTaskRecord {
  id: string;
  title: string;
  objective: string;
  group?: string;
  profile?: string;
  priority?: "low" | "normal" | "high";
  tags?: string[];
  labels?: string[];
  metadata?: Record<string, string>;
  parentTaskId?: string;
  childTaskIds?: string[];
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  executionMode: "local" | "delegated";
  orchestrationMode?: DelegationOrchestrationMode;
  workerMode?: "inline" | "process";
  workerPid?: number;
  attempts?: number;
  maxAttempts?: number;
  startedAt?: string;
  lastOutputPath?: string;
  notes: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
