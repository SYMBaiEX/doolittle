import type { PersistedQueuedMessage } from "../conversation-persistence";

export function queuedMessageRemovalTargets(
  queue: readonly PersistedQueuedMessage[],
  {
    sessionId,
    dispatchingId,
    messageId,
    resolveSessionBot,
  }: {
    sessionId: string;
    dispatchingId: string | null;
    messageId?: string;
    resolveSessionBot: (sessionId: string) => string;
  },
) {
  return queue
    .filter(
      (message) =>
        message.sessionId === sessionId &&
        message.id !== dispatchingId &&
        (messageId === undefined || message.id === messageId),
    )
    .map((message) => ({
      message,
      botId: message.botId ?? resolveSessionBot(message.sessionId),
    }));
}
