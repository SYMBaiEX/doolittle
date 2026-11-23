import type { AgentExecutionContext } from "../chat";
import { handleDelegationCreationMutation } from "./delegation-mutations/creation";
import { handleDelegationTaskMutation } from "./delegation-mutations/tasks";
import type { DelegationMutationOptions } from "./delegation-mutations/types";

export async function handleDelegationMutationCommand(
  trimmed: string,
  context: AgentExecutionContext,
  options: DelegationMutationOptions,
): Promise<string | undefined> {
  const creationResponse = await handleDelegationCreationMutation(
    trimmed,
    context,
  );
  if (typeof creationResponse !== "undefined") {
    return creationResponse;
  }

  return handleDelegationTaskMutation(trimmed, context, options);
}
