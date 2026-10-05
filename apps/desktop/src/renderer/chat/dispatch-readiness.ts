/** Presentation feedback only. Native ownership and admission remain authoritative. */
export function chatDispatchBlockReason(input: {
  hasContent: boolean;
  sessionId: string;
  workspaceKind: "unbound" | "current" | "foreign" | "unknown";
  alreadyClaimed: boolean;
  ownerResolved: boolean;
  ownerReady: boolean;
  backendReady: boolean;
  hydration: "checking" | "ready" | "unavailable";
}): string | undefined {
  if (!input.hasContent)
    return "Write a message or attach a file before sending.";
  if (!input.sessionId)
    return "Select a conversation before sending. Your draft was kept.";
  if (!input.ownerResolved)
    return "This conversation’s owner is still unavailable. Select its bot before sending; your draft was kept.";
  if (input.workspaceKind === "foreign")
    return "Open this conversation’s project before sending. Your draft was kept.";
  if (input.workspaceKind === "unknown")
    return "This conversation’s project could not be resolved. Restore its project context before sending.";
  if (input.alreadyClaimed)
    return "This conversation is already starting or running a response. Your draft was kept.";
  if (!input.backendReady || !input.ownerReady)
    return "This bot is not ready. Start or recover it before sending; your draft was kept.";
  if (input.hydration !== "ready")
    return "Active run recovery is not ready. Retry the run list before sending; your draft was kept.";
  return undefined;
}
