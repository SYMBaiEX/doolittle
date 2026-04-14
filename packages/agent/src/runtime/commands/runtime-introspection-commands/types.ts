import type { AgentExecutionContext } from "@/runtime/chat";

export type RuntimeIntrospectionCommandHandler = (
  trimmed: string,
  context: AgentExecutionContext,
) => Promise<string | undefined>;
