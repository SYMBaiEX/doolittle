import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext } from "../../chat";
import { handleGatewayRuntimeOperationCommand } from "./operations";
import { handleGatewayRuntimeReadoutCommand } from "./readouts";
import { handleGatewaySessionControlCommand } from "./session-controls";

export async function handleGatewayRuntimeCommand(
  input: ChatTurnRequest,
  trimmed: string,
  sessionKey: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  const readoutResult = await handleGatewayRuntimeReadoutCommand(
    input,
    trimmed,
    context,
  );
  if (readoutResult) {
    return readoutResult;
  }

  const operationResult = await handleGatewayRuntimeOperationCommand(
    input,
    trimmed,
    context,
  );
  if (operationResult) {
    return operationResult;
  }

  const sessionControlResult = await handleGatewaySessionControlCommand(
    input,
    trimmed,
    sessionKey,
    context,
  );
  if (sessionControlResult) {
    return sessionControlResult;
  }

  return undefined;
}
