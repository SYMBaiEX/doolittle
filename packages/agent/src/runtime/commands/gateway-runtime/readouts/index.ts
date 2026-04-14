import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext } from "../../../chat";
import { handlePlatformReadout } from "./platforms";
import { handleRuntimeReadout } from "./runtime";
import { handleTransportReadout } from "./transport";

export async function handleGatewayRuntimeReadoutCommand(
  _input: ChatTurnRequest,
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  const handlers = [
    handleTransportReadout,
    handlePlatformReadout,
    handleRuntimeReadout,
  ];

  for (const handler of handlers) {
    const result = await handler(trimmed, context);
    if (result !== undefined) {
      return result;
    }
  }

  return undefined;
}
