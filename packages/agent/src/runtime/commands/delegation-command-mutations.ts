import type { AgentExecutionContext } from "../chat";
import { handleDelegationCreationMutation } from "./delegation-mutations/creation";
import { handleDelegationQueueMutation } from "./delegation-mutations/queue";
import { handleDelegationTaskMutation } from "./delegation-mutations/tasks";
import type { DelegationMutationOptions } from "./delegation-mutations/types";

export async function handleDelegationMutationCommand(
  trimmed: string,
  context: AgentExecutionContext,
  options: DelegationMutationOptions,
): Promise<string | undefined> {
  const queueResponse = await handleDelegationQueueMutation(
    trimmed,
    context,
    options,
  );
  if (typeof queueResponse !== "undefined") {
    return queueResponse;
  }

  const creationResponse = await handleDelegationCreationMutation(
    trimmed,
    context,
  );
  if (typeof creationResponse !== "undefined") {
    return creationResponse;
  }

  const taskResponse = await handleDelegationTaskMutation(
    trimmed,
    context,
    options,
  );
  if (typeof taskResponse !== "undefined") {
    return taskResponse;
  }

  return undefined;
}
