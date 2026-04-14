import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext, AgentTurnHooks } from "../../chat";
import { handleOperatorMigrationCommand } from "./migrations";
import { handleOperatorRepositoryCommand } from "./repository";
import { handleOperatorStatusCommand } from "./status";
import { handleOperatorTerminalCommand } from "./terminal";

export async function handleOperatorCommand(
  input: ChatTurnRequest,
  trimmed: string,
  context: AgentExecutionContext,
  hooks?: AgentTurnHooks,
): Promise<string | undefined> {
  return (
    (await handleOperatorStatusCommand(trimmed, context)) ??
    (await handleOperatorMigrationCommand(trimmed, context)) ??
    (await handleOperatorTerminalCommand(input, trimmed, context, hooks)) ??
    (await handleOperatorRepositoryCommand(trimmed, context))
  );
}
