import type { AgentExecutionContext } from "../chat";
import { OrchestratorTaskServiceUnavailableError } from "../native/service-bridge/delegation/index";
import { handleDelegationMutationCommand } from "./delegation-command-mutations";
import { handleDelegationReadCommand } from "./delegation-read";

export async function handleDelegationCommand(
  trimmed: string,
  context: AgentExecutionContext,
  options: {
    executeDelegationTask: (taskId: string) => Promise<unknown>;
  },
): Promise<string | undefined> {
  if (/^\/delegate (?:supervise|execute-queued)(?:\s|$)/u.test(trimmed)) {
    return "ElizaOS automatically supervises queued tasks. Use `/delegate overview` to inspect them.";
  }

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
