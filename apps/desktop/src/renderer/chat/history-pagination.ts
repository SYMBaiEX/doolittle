export const TRANSCRIPT_PAGE_SIZE = 50;

export interface HistoryPageState {
  hasEarlier: boolean;
  nextOffset: number;
  totalMessages?: number;
  /** Raw server IDs count toward the offset even when their roles aren't rendered. */
  messageIds: string[];
}

export function refreshHistoryPage(
  previous: HistoryPageState | undefined,
  latest: HistoryPageState,
) {
  const head = latest.messageIds[0];
  const overlap =
    latest.hasEarlier && head ? (previous?.messageIds.indexOf(head) ?? -1) : -1;
  // An overlap proves the old prefix and the refreshed tail meet. A reset or
  // rewritten transcript with no anchor should use the server's new page.
  if (
    !previous ||
    overlap <= 0 ||
    (latest.totalMessages !== undefined &&
      previous.totalMessages !== undefined &&
      latest.totalMessages < previous.totalMessages)
  ) {
    return { page: latest, retainIds: new Set<string>() };
  }
  const retained = previous.messageIds.slice(0, overlap);
  const nextOffset = latest.nextOffset + retained.length;
  return {
    page: {
      ...latest,
      hasEarlier:
        latest.totalMessages === undefined
          ? previous.hasEarlier
          : nextOffset < latest.totalMessages,
      nextOffset,
      messageIds: [...retained, ...latest.messageIds],
    },
    retainIds: new Set(retained),
  };
}

export function extendHistoryPage(
  current: HistoryPageState,
  earlier: HistoryPageState,
): HistoryPageState {
  return {
    ...earlier,
    messageIds: [...new Set([...earlier.messageIds, ...current.messageIds])],
  };
}
