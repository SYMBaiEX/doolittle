import { OrchestratorTaskServiceUnavailableError } from "@/runtime/native/service-bridge/delegation";
import type { AgentExecutionContext } from "../chat";
import { handleDelegationMutationCommand } from "./delegation-command-mutations";
import { handleDelegationReadCommand } from "./delegation-read";

export async function handleDelegationCommand(
  trimmed: string,
  context: AgentExecutionContext,
  options: {
    executeDelegationTask: (taskId: string) => Promise<unknown>;
  },
): Promise<string | undefined> {
  try {
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
  } catch (error) {
    if (error instanceof OrchestratorTaskServiceUnavailableError) {
      return JSON.stringify(
        {
          available: false,
          code: error.code,
          error: error.message,
        },
        null,
        2,
      );
    }
    throw error;
  }
}
