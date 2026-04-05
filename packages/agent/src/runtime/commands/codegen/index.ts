import type { AgentExecutionContext } from "../../chat";
import { handleCodegenRuntimeCommand } from "./runtime";
import { handleCodegenWorkflowCommand } from "./workflows";

export async function handleCodegenCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  return (
    (await handleCodegenRuntimeCommand(trimmed, context)) ??
    (await handleCodegenWorkflowCommand(trimmed, context))
  );
}
