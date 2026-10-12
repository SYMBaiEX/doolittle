import type {
  BotConversationScope,
  SessionSummary,
} from "../shared/contracts/conversations";
import type { PersistedQueuedMessage } from "./conversation-persistence";
import { queuedMessageWorkspaceStatus } from "./conversation-persistence";
import type { DesktopPlatform } from "./workspace-path";

export type SessionConversationScope =
  | { kind: "confirmed"; conversation: BotConversationScope }
  | { kind: "pending"; projectId?: string }
  | { kind: "unknown" };

/** Host rows and bind responses outrank presentation-only draft intent. */
export function resolveSessionConversationScope(
  sessionId: string,
  saved: readonly SessionSummary[],
  bound: Readonly<Record<string, BotConversationScope>>,
  draftProject: Readonly<Record<string, string | null>>,
): SessionConversationScope {
  const row = saved.find((entry) => entry.sessionId === sessionId);
  if (row) {
    if (!row.workspacePath) return { kind: "unknown" };
    return {
      kind: "confirmed",
      conversation: {
        sessionId,
        botId: row.botId ?? bound[sessionId]?.botId ?? "",
        ...(row.projectId ? { projectId: row.projectId } : {}),
        workspacePath: row.workspacePath,
        ...(row.projectContext ? { projectContext: row.projectContext } : {}),
        createdAt: row.startedAt ?? "",
        updatedAt: row.endedAt ?? row.startedAt ?? "",
      },
    };
  }
  const confirmed = bound[sessionId];
  if (confirmed) return { kind: "confirmed", conversation: confirmed };
  if (Object.hasOwn(draftProject, sessionId))
    return {
      kind: "pending",
      ...(draftProject[sessionId]
        ? { projectId: draftProject[sessionId] ?? undefined }
        : {}),
    };
  return { kind: "unknown" };
}

/** Recovered queue data cannot grant or change a chat's host scope. */
export function queuedMessageMatchesConfirmedScope(
  message: PersistedQueuedMessage,
  scope: SessionConversationScope | undefined,
  platform: DesktopPlatform,
): boolean {
  return (
    scope?.kind === "confirmed" &&
    message.sessionId === scope.conversation.sessionId &&
    message.botId === scope.conversation.botId &&
    message.projectId === scope.conversation.projectId &&
    queuedMessageWorkspaceStatus(
      message,
      scope.conversation.workspacePath,
      platform,
    ) === "ready"
  );
}
