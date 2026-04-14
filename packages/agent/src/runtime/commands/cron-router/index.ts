import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext } from "../../chat";
import { handleCronMutationCommand } from "./mutations";
import { handleCronReadCommand } from "./read";

export async function handleCronCommand(
  input: ChatTurnRequest,
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  for (const handler of [handleCronReadCommand, handleCronMutationCommand]) {
    const response = await handler(input, trimmed, context);
    if (typeof response !== "undefined") {
      return response;
    }
  }

  return undefined;
}
