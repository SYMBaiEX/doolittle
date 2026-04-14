import type { AgentExecutionContext } from "../../../chat";

export type GatewayRuntimeReadoutHandler = (
  trimmed: string,
  context: AgentExecutionContext,
) => Promise<string | undefined>;
