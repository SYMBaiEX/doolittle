import type { AgentExecutionContext } from "../../chat";

export type RuntimeIntrospectionCommandHandler = (
  trimmed: string,
  context: AgentExecutionContext,
) => Promise<string | undefined>;
