import type { AgentExecutionContext } from "../../chat";

export type SkillCommandHandler = (
  trimmed: string,
  context: AgentExecutionContext,
) => Promise<string | undefined> | string | undefined;
