import type { AgentExecutionContext } from "../../chat";
import { handleSkillCatalogCommand } from "./catalog";
import { handleGeneratedSkillCommand } from "./generated";
import { handleSkillInventoryCommand } from "./inventory";

export async function handleSkillCommand(
  trimmed: string,
  context: AgentExecutionContext,
  options?: { sessionId?: string },
): Promise<string | undefined> {
  for (const handler of [
    handleSkillInventoryCommand,
    handleSkillCatalogCommand,
    handleGeneratedSkillCommand,
  ]) {
    const response = await handler(trimmed, context, options);
    if (response !== undefined) {
      return response;
    }
  }

  return undefined;
}
