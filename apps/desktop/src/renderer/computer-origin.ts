/** Captured when a conversation opens a host tool, never inferred from later focus. */
export interface ComputerOrigin {
  botId: string;
  originConversationId: string;
  workspacePath: string;
}

export async function ensureComputerOriginOwnerBinding(
  origin: ComputerOrigin,
  options: {
    savedSessionIds: ReadonlySet<string>;
    localBotBindings: Readonly<Record<string, string>>;
    projectId?: string;
    bind: (
      botId: string,
      sessionId: string,
      projectId?: string,
    ) => Promise<unknown>;
  },
): Promise<void> {
  const { originConversationId: sessionId, botId } = origin;
  if (options.savedSessionIds.has(sessionId)) return;
  if (options.localBotBindings[sessionId] !== botId) {
    throw new Error(
      "Computer access requires this draft's captured bot owner.",
    );
  }
  await options.bind(botId, sessionId, options.projectId);
}

export function computerOriginKey(origin?: ComputerOrigin): string {
  return origin
    ? JSON.stringify([origin.botId, origin.originConversationId])
    : "";
}
