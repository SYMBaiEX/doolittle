import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext } from "../chat";
import { handleRuntimePolicyCommand } from "./runtime-workspace/policy";
import { handleRuntimeStatusCommand } from "./runtime-workspace/status";
import type { RuntimeWorkspaceCommandHandler } from "./runtime-workspace/types";
import { handleRuntimeWorkspaceIoCommand } from "./runtime-workspace/workspace";

export async function handleRuntimeWorkspaceCommand(
  input: ChatTurnRequest,
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  for (const handler of [
    handleRuntimeWorkspaceIoCommand,
    handleRuntimeStatusCommand,
    handleRuntimePolicyCommand,
  ] satisfies RuntimeWorkspaceCommandHandler[]) {
    const response = await handler(input, trimmed, context);
    if (response !== undefined) {
      return response;
    }
  }

  return undefined;
}
