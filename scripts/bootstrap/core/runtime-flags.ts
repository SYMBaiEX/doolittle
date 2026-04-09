import {
  RUN_DEPTH_ITERATION_PRESETS,
  type RunDepth,
  type ToolProgressMode,
} from "../../../packages/agent/src/types";

export function resolveRunDepth(value?: string | null): RunDepth {
  if (
    value === "quick" ||
    value === "standard" ||
    value === "deep" ||
    value === "explore"
  ) {
    return value;
  }
  return "standard";
}

export function resolveToolProgressMode(
  value?: string | null,
): ToolProgressMode {
  if (
    value === "off" ||
    value === "new" ||
    value === "all" ||
    value === "verbose"
  ) {
    return value;
  }
  return "new";
}

export function resolveMaxIterations(existingEnv: Map<string, string>): number {
  const explicit = Number(existingEnv.get("DOOLITTLE_MAX_ITERATIONS") || "");
  if (Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }
  return RUN_DEPTH_ITERATION_PRESETS[
    resolveRunDepth(existingEnv.get("DOOLITTLE_RUN_DEPTH"))
  ];
}
