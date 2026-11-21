import { resolveTrajectoryGate } from "@elizaos/core";
import { isTruthyEnvValue } from "@elizaos/shared/env-utils";

/** Full SDK capture is opt-in even when a local host leaves NODE_ENV unset. */
export function setDefaultTrajectoryCapture(env: NodeJS.ProcessEnv): void {
  if (
    resolveTrajectoryGate(env).reason === "dev-default-on" &&
    !isTruthyEnvValue(env.ELIZA_TRAJECTORY_STRICT)
  ) {
    env.ELIZA_TRAJECTORY_LOGGING = "false";
  }
}
