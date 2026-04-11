import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext } from "../chat";
import { handleUserProfileReadCommand } from "./user-profile/read-commands";
import { handleUserProfileWriteCommand } from "./user-profile/write-commands";

export async function handleUserProfileCommand(
  input: ChatTurnRequest,
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  return (
    handleUserProfileReadCommand(input, trimmed, context) ??
    handleUserProfileWriteCommand(input, trimmed, context)
  );
}
