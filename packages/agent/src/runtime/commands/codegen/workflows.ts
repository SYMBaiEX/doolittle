import type { AgentExecutionContext } from "../../chat";
import { handleCodegenGithubCommand } from "./github";
import { handleCodegenSecretsCommand } from "./secrets";
import { handleTrackedCodegenCommand } from "./tracked";

export async function handleCodegenWorkflowCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  for (const handler of [
    handleTrackedCodegenCommand,
    handleCodegenGithubCommand,
    handleCodegenSecretsCommand,
  ]) {
    const response = await handler(trimmed, context);
    if (response !== undefined) {
      return response;
    }
  }

  return undefined;
}
