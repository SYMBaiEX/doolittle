/** Returns only IDs appended after an existing transcript tail. */
export function appendedMessageIds(
  previousIds: readonly string[],
  currentIds: readonly string[],
): string[] {
  if (currentIds.length <= previousIds.length) return [];

  // Loading earlier history prepends messages while retaining the old tail.
  if (
    previousIds.length > 0 &&
    previousIds.every(
      (id, index) =>
        currentIds[currentIds.length - previousIds.length + index] === id,
    )
  ) {
    return [];
  }

  if (!previousIds.every((id, index) => currentIds[index] === id)) {
    return [];
  }

  const existing = new Set(previousIds);
  return currentIds.slice(previousIds.length).filter((id) => !existing.has(id));
}

export function mergeUnreadMessageIds(
  existingIds: readonly string[],
  appendedIds: readonly string[],
): string[] {
  return [...new Set([...existingIds, ...appendedIds])];
}

export function addUnreadMessageIds(
  unreadBySession: Readonly<Record<string, readonly string[]>>,
  sessionId: string,
  appendedIds: readonly string[],
): Record<string, string[]> {
  const mutableUnreadBySession: Record<string, string[]> = Object.fromEntries(
    Object.entries(unreadBySession).map(([id, ids]) => [id, [...ids]]),
  );
  return {
    ...mutableUnreadBySession,
    [sessionId]: mergeUnreadMessageIds(
      unreadBySession[sessionId] ?? [],
      appendedIds,
    ),
  };
}
