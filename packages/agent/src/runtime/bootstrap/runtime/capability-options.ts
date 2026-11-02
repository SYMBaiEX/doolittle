import type { AgentRuntime } from "@elizaos/core";

/** Assistant capabilities are composed explicitly by the foundation plugins. */
export const DOOLITTLE_RUNTIME_CAPABILITY_OPTIONS = {
  enableAutonomy: false,
} as const satisfies Pick<
  ConstructorParameters<typeof AgentRuntime>[0],
  "enableAutonomy"
>;
