import type { AgentExecutionContext } from "../../chat";
import { handleDelegationDetailsRead } from "./details";
import { handleDelegationListingsRead } from "./listings";
import { handleDelegationWorkersRead } from "./workers";

export async function handleDelegationReadCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  for (const handler of [
    handleDelegationListingsRead,
    handleDelegationDetailsRead,
    handleDelegationWorkersRead,
  ]) {
    const response = await handler(trimmed, context);
    if (typeof response !== "undefined") {
      return response;
    }
  }

  return undefined;
}
