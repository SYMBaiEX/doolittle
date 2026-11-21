import type { DisplayMessage } from "./models";

function canonicalReplyIndexAfter(
  history: readonly DisplayMessage[],
  matchedUserIndex: number,
): number | undefined {
  for (let index = matchedUserIndex + 1; index < history.length; index += 1) {
    if (history[index]?.role === "assistant") return index;
    // A later user turn makes a later assistant reply ambiguous. Keep the
    // synthetic row retryable rather than silently attributing that reply.
    if (history[index]?.role === "user") return undefined;
  }
  return undefined;
}

function localUserIndexForReply(
  messages: readonly DisplayMessage[],
  replyIndex: number,
  userIndexByRun: ReadonlyMap<string, number>,
): number | undefined {
  const reply = messages[replyIndex];
  const runId = reply.runId ?? reply.id.slice("assistant:".length);
  const correlated = userIndexByRun.get(runId);
  if (correlated !== undefined) return correlated;
  if (messages[replyIndex - 1]?.role === "user") return replyIndex - 1;
  // Repair older caches sorted by dispatch time: the synthetic assistant can
  // precede its server-persisted user by a few milliseconds. Do not associate
  // arbitrary later turns, even when their prompt text is identical.
  const next = messages[replyIndex + 1];
  const nextDelay = next
    ? Date.parse(next.createdAt) - Date.parse(reply.createdAt)
    : Number.NaN;
  if (next?.role === "user" && nextDelay >= 0 && nextDelay <= 2_000) {
    return replyIndex + 1;
  }
  return undefined;
}

function reconcilePendingMessages(
  localMessages: readonly DisplayMessage[],
  history: readonly DisplayMessage[],
  activeRequestIds: ReadonlySet<string>,
  matchedHistoryByLocalIndex: ReadonlyMap<number, number>,
  userIndexByRun: ReadonlyMap<string, number>,
): DisplayMessage[] {
  return localMessages.flatMap((message, index) => {
    if (matchedHistoryByLocalIndex.has(index)) {
      return [];
    }
    if (message.role !== "assistant" || !message.id.startsWith("assistant:")) {
      return [message];
    }
    const requestId = message.id.slice("assistant:".length);
    const userIndex = localUserIndexForReply(
      localMessages,
      index,
      userIndexByRun,
    );
    const matchedUserIndex =
      userIndex === undefined
        ? undefined
        : matchedHistoryByLocalIndex.get(userIndex);
    // Only a canonical assistant belonging to this exact, one-to-one matched
    // user turn may supersede the placeholder. A completed older turn is not
    // evidence that the latest synthetic response completed.
    if (
      matchedUserIndex !== undefined &&
      canonicalReplyIndexAfter(history, matchedUserIndex) !== undefined
    ) {
      return [];
    }
    // Canonical history is the completed source of truth. It must supersede a
    // locally active placeholder as well; otherwise a late history refresh
    // visibly renders the same assistant turn twice. A still-active request
    // remains pending only when no canonical assistant has completed its turn.
    const matchedUserCreatedAt =
      matchedUserIndex === undefined
        ? undefined
        : history[matchedUserIndex]?.createdAt;
    const orderedMessage = {
      ...message,
      // History can arrive with a canonical user timestamp a few
      // milliseconds newer than the optimistic row. Keep a retryable
      // placeholder after its matched user in the rendered transcript.
      createdAt:
        matchedUserCreatedAt &&
        message.createdAt.localeCompare(matchedUserCreatedAt) < 0
          ? matchedUserCreatedAt
          : message.createdAt,
    };
    if (activeRequestIds.has(requestId) || !message.pending)
      return [orderedMessage];
    return [
      {
        ...orderedMessage,
        content:
          "This response was interrupted before it finished. Retry it to continue.",
        pending: false,
        error: true,
      },
    ];
  });
}

function sameAttachmentSet(
  left: DisplayMessage["attachments"],
  right: DisplayMessage["attachments"],
): boolean {
  const leftIds = (left ?? []).map((attachment) => attachment.id).sort();
  const rightIds = (right ?? []).map((attachment) => attachment.id).sort();
  return (
    leftIds.length === rightIds.length &&
    leftIds.every((id, index) => id === rightIds[index])
  );
}

function sameCapsule(
  left: DisplayMessage["contextCapsule"],
  right: DisplayMessage["contextCapsule"],
): boolean {
  if (!left && !right) return true;
  return (
    left?.kind === right?.kind &&
    left?.path === right?.path &&
    left?.source === right?.source
  );
}

function messageDistance(left: DisplayMessage, right: DisplayMessage): number {
  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.abs(leftTime - rightTime);
}

function indexHistoryContent(history: readonly DisplayMessage[]) {
  const byRole = {
    user: new Map<string, number[]>(),
    assistant: new Map<string, number[]>(),
  };
  for (const [index, message] of history.entries()) {
    const content = byRole[message.role];
    const matches = content.get(message.content);
    if (matches) matches.push(index);
    else content.set(message.content, [index]);
  }
  return byRole;
}

function matchLocalRowsToHistory(
  localMessages: readonly DisplayMessage[],
  history: readonly DisplayMessage[],
  userIndexByRun: ReadonlyMap<string, number>,
): Map<number, number> {
  const firstHistoryIndexById = new Map<string, number>();
  for (const [index, message] of history.entries()) {
    if (!firstHistoryIndexById.has(message.id))
      firstHistoryIndexById.set(message.id, index);
  }
  const matchedHistory = new Set<number>();
  const matchedHistoryByLocalIndex = new Map<number, number>();
  // Retain exact-ID anchors on subsequent refreshes, after the optimistic
  // user row has already been replaced by its canonical counterpart.
  for (const [localIndex, local] of localMessages.entries()) {
    const index = firstHistoryIndexById.get(local.id);
    if (index === undefined) continue;
    matchedHistory.add(index);
    matchedHistoryByLocalIndex.set(localIndex, index);
  }
  let contentIndex: ReturnType<typeof indexHistoryContent> | undefined;
  const maximumDistance = 2 * 60 * 1_000;
  for (const [localIndex, local] of localMessages.entries()) {
    if (matchedHistoryByLocalIndex.has(localIndex)) continue;
    if (local.role === "assistant" && local.id.startsWith("assistant:"))
      continue;
    if (local.pending || !local.content) continue;
    contentIndex ??= indexHistoryContent(history);
    const indexes = contentIndex[local.role].get(local.content);
    if (!indexes) continue;
    let bestIndex: number | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const index of indexes) {
      const message = history[index];
      if (
        matchedHistory.has(index) ||
        !sameAttachmentSet(message.attachments, local.attachments) ||
        !sameCapsule(message.contextCapsule, local.contextCapsule)
      )
        continue;
      const distance = messageDistance(message, local);
      // Equal distances keep the earlier history row, as the stable
      // distance sort did before the candidate index.
      if (distance <= maximumDistance && distance < bestDistance) {
        bestIndex = index;
        bestDistance = distance;
      }
    }
    if (bestIndex === undefined) continue;
    matchedHistory.add(bestIndex);
    matchedHistoryByLocalIndex.set(localIndex, bestIndex);
  }
  for (const [localIndex, local] of localMessages.entries()) {
    if (local.role !== "assistant" || !local.id.startsWith("assistant:"))
      continue;
    const userIndex = localUserIndexForReply(
      localMessages,
      localIndex,
      userIndexByRun,
    );
    const matchedUserIndex =
      userIndex === undefined
        ? undefined
        : matchedHistoryByLocalIndex.get(userIndex);
    if (matchedUserIndex === undefined) continue;
    const replyIndex = canonicalReplyIndexAfter(history, matchedUserIndex);
    if (replyIndex !== undefined)
      matchedHistoryByLocalIndex.set(localIndex, replyIndex);
  }
  return matchedHistoryByLocalIndex;
}

/**
 * Replace optimistic desktop rows with the server-authoritative transcript.
 * IDs differ by design, so reconcile one-to-one by payload and timestamp. The
 * one-to-one match preserves intentionally repeated prompts while preventing a
 * completed turn from rendering twice when history refreshes.
 */
export function mergeConversationHistory(
  localMessages: readonly DisplayMessage[],
  history: readonly DisplayMessage[],
  activeRequestIds: ReadonlySet<string>,
): DisplayMessage[] {
  const userIndexByRun = new Map<string, number>();
  for (const [index, message] of localMessages.entries()) {
    if (
      message.role === "user" &&
      message.runId !== undefined &&
      !userIndexByRun.has(message.runId)
    ) {
      userIndexByRun.set(message.runId, index);
    }
  }
  const matchedHistoryByLocalIndex = matchLocalRowsToHistory(
    localMessages,
    history,
    userIndexByRun,
  );
  const canonical = [...history];
  for (const [localIndex, historyIndex] of matchedHistoryByLocalIndex) {
    const local = localMessages[localIndex];
    const runId =
      local.runId ??
      (local.id.startsWith("assistant:")
        ? local.id.slice("assistant:".length)
        : undefined);
    if (!runId) continue;
    canonical[historyIndex] = {
      ...canonical[historyIndex],
      runId,
    };
  }

  return [
    ...canonical,
    ...reconcilePendingMessages(
      localMessages,
      history,
      activeRequestIds,
      matchedHistoryByLocalIndex,
      userIndexByRun,
    ),
  ].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}
