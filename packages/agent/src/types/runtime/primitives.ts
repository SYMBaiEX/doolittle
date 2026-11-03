import type { RunDepth } from "@doolittle/contracts/run";

export type { RunDepth, ToolProgressMode } from "@doolittle/contracts/run";

export type MemoryTarget = "memory" | "user";
export type DelegationOrchestrationMode =
  | "sequential"
  | "parallel"
  | "hierarchical";

export const RUN_DEPTH_ITERATION_PRESETS: Record<RunDepth, number> = {
  quick: 15,
  standard: 45,
  deep: 90,
  explore: 150,
};
