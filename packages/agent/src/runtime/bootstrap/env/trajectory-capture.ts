import { isAbsolute, join } from "node:path";
import { resolveTrajectoryGate } from "@elizaos/core";
import { isTruthyEnvValue } from "@elizaos/shared/env-utils";

const MAX_CAPTURE_MINUTES = 30;
const MAX_CAPTURE_MIB = 128;

export interface TrajectoryCaptureBudget {
  durationMs: number;
  relationBytes: number;
}

/** Full SDK capture is opt-in even when a local host leaves NODE_ENV unset. */
export function setDefaultTrajectoryCapture(env: NodeJS.ProcessEnv): void {
  if (
    resolveTrajectoryGate(env).reason === "dev-default-on" &&
    !isTruthyEnvValue(env.ELIZA_TRAJECTORY_STRICT)
  ) {
    env.ELIZA_TRAJECTORY_LOGGING = "false";
  }
}

function isIsolatedEvaluation(env: NodeJS.ProcessEnv): boolean {
  const dataDir = env.DOOLITTLE_DATA_DIR;
  return (
    env.DOOLITTLE_EVAL_CAPTURE_MODEL_USAGE === "true" &&
    !!dataDir &&
    isAbsolute(dataDir) &&
    env.ELIZA_HOME === dataDir &&
    env.ELIZA_STATE_DIR === dataDir &&
    isTruthyEnvValue(env.ELIZA_VAULT_DISABLE_KEYCHAIN) &&
    (!env.PGLITE_DATA_DIR || env.PGLITE_DATA_DIR === join(dataDir, "pglite")) &&
    !env.DATABASE_URL?.trim() &&
    !env.POSTGRES_URL?.trim()
  );
}

function lowerLimit(value: string | undefined, maximum: number): number {
  const limit = value && /^\d+$/.test(value) ? Number(value) : 0;
  return Number.isSafeInteger(limit) && limit > 0
    ? Math.min(limit, maximum)
    : maximum;
}

/** A dedicated eval profile keeps full traces so its exports stay complete. */
export function resolveTrajectoryCaptureBudget(
  env: NodeJS.ProcessEnv,
): TrajectoryCaptureBudget | undefined {
  if (!resolveTrajectoryGate(env).enabled || isIsolatedEvaluation(env)) {
    return undefined;
  }
  return {
    durationMs:
      lowerLimit(env.DOOLITTLE_TRACE_MAX_MINUTES, MAX_CAPTURE_MINUTES) * 60_000,
    relationBytes:
      lowerLimit(env.DOOLITTLE_TRACE_MAX_MIB, MAX_CAPTURE_MIB) * 1024 * 1024,
  };
}
