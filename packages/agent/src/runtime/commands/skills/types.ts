import type { AgentExecutionContext } from "../../chat";

export type SkillCommandHandler = (
  trimmed: string,
  context: AgentExecutionContext,
  options?: { sessionId?: string },
) => Promise<string | undefined> | string | undefined;
