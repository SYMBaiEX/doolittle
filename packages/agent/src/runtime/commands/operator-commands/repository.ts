import { executeRepositoryCommand } from "@/actions/repository-action";
import type { AgentExecutionContext } from "../../chat";

export async function handleOperatorRepositoryCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  return executeRepositoryCommand(context.runtime, context.services, trimmed);
}
