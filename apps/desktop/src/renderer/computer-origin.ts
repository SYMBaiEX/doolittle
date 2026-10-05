/** Captured when a conversation opens a host tool, never inferred from later focus. */
export interface ComputerOrigin {
  botId: string;
  originConversationId: string;
  workspacePath: string;
}

export function computerOriginKey(origin?: ComputerOrigin): string {
  return origin
    ? JSON.stringify([origin.botId, origin.originConversationId])
    : "";
}
