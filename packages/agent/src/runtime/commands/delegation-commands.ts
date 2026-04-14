import type { AgentExecutionContext } from "../chat";
import { handleDelegationMutationCommand } from "./delegation-command-mutations";
import { handleDelegationReadCommand } from "./delegation-read";

export async function handleDelegationCommand(
  trimmed: string,
  context: AgentExecutionContext,
  options: {
    runDelegationTaskInWorker: (
      taskId: string,
      options?: { assumeRunning?: boolean },
    ) => Promise<unknown>;
  },
): Promise<string | undefined> {
  const readResponse = await handleDelegationReadCommand(trimmed, context);
  if (typeof readResponse !== "undefined") {
    return readResponse;
  }

  const mutationResponse = await handleDelegationMutationCommand(
    trimmed,
    context,
    options,
  );
  if (typeof mutationResponse !== "undefined") {
    return mutationResponse;
  }

  return undefined;
}
