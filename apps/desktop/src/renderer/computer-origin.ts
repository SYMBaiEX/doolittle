import type { BotConversationScope } from "../shared/contracts/conversations";
import type { SessionConversationScope } from "./session-conversation-scope";

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

/** A human may open a fresh scratch draft; historical and project drafts need explicit scope. */
export async function resolveTerminalConversationOrigin(
  origin: ComputerOrigin,
  scope: SessionConversationScope,
  options: {
    savedSessionIds: ReadonlySet<string>;
    localBotBindings: Readonly<Record<string, string>>;
    freshScratchDraftIds: ReadonlySet<string>;
    bind: (
      botId: string,
      sessionId: string,
      projectId?: string,
    ) => Promise<BotConversationScope>;
  },
): Promise<{ origin: ComputerOrigin; conversation: BotConversationScope }> {
  if (
    scope.kind === "unknown" ||
    (scope.kind === "pending" &&
      (scope.projectId ||
        !options.freshScratchDraftIds.has(origin.originConversationId) ||
        options.savedSessionIds.has(origin.originConversationId)))
  )
    throw new Error("A confirmed chat workspace is required.");
  if (
    scope.kind === "confirmed" &&
    (scope.conversation.botId !== origin.botId ||
      scope.conversation.sessionId !== origin.originConversationId ||
      scope.conversation.workspacePath !== origin.workspacePath ||
      !origin.workspacePath)
  )
    throw new Error("Conversation scope changed.");

  let conversation =
    scope.kind === "confirmed" ? scope.conversation : undefined;
  const projectId = conversation?.projectId;
  await ensureComputerOriginOwnerBinding(origin, {
    ...options,
    projectId,
    bind: async (botId, sessionId, boundProjectId) => {
      const bound = await options.bind(botId, sessionId, boundProjectId);
      if (
        bound.botId !== botId ||
        bound.sessionId !== sessionId ||
        bound.projectId !== boundProjectId ||
        !bound.workspacePath ||
        (conversation && bound.workspacePath !== conversation.workspacePath)
      )
        throw new Error("Conversation scope changed.");
      conversation = bound;
    },
  });
  if (!conversation) throw new Error("Chat workspace could not be confirmed.");
  return {
    origin: { ...origin, workspacePath: conversation.workspacePath },
    conversation,
  };
}

export function computerOriginKey(origin?: ComputerOrigin): string {
  return origin
    ? JSON.stringify([origin.botId, origin.originConversationId])
    : "";
}
