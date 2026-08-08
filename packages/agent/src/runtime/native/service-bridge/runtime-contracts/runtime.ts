import type { IAgentRuntime } from "@elizaos/core";

export type RuntimeLike = Partial<
  Pick<
    IAgentRuntime,
    | "agentId"
    | "getService"
    | "getModel"
    | "getAllActions"
    | "getMessageConnectors"
    | "character"
  >
>;
