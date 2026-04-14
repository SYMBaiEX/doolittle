import type { IAgentRuntime } from "@elizaos/core";

export type RuntimeLike = Partial<
  Pick<IAgentRuntime, "getService" | "getAllActions">
>;
