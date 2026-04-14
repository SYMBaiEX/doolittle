export type MemoryTarget = "memory" | "user";
export type RunDepth = "quick" | "standard" | "deep" | "explore";
export type ToolProgressMode = "off" | "new" | "all" | "verbose";
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
