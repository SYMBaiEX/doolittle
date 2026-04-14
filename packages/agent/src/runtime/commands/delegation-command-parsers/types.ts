export type DelegationSegments = {
  head: string;
  objective: string;
  options: Record<string, string>;
};

export type DelegationSpawnSegments = {
  parentId: string;
  objective: string;
  options: Record<string, string>;
};

export type DelegationFilter = {
  limit?: number;
  concurrency?: number;
  group?: string;
  profile?: string;
  priority?: "low" | "normal" | "high";
  label?: string;
  parentTaskId?: string;
  status?: "pending" | "running" | "completed" | "failed" | "cancelled";
  executionMode?: "local" | "delegated";
};
