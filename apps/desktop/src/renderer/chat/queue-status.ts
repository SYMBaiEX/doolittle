import type { QueuedMessageWorkspaceStatus } from "../conversation-persistence";
import type { RunHydrationStatus } from "./run-hydration-scope";

export function queueHeadStatus({
  otherConversation,
  workspaceStatus,
  paused,
  runtimeReady,
  hydration,
  busy,
}: {
  otherConversation: boolean;
  workspaceStatus: QueuedMessageWorkspaceStatus;
  paused: boolean;
  runtimeReady: boolean;
  hydration: RunHydrationStatus;
  busy: boolean;
}): string {
  const waiting = otherConversation
    ? "An earlier message in another chat "
    : "The first message ";
  if (workspaceStatus === "legacy-unbound")
    return `${waiting}has no saved workspace. Remove it to continue the queue.`;
  if (workspaceStatus === "different-workspace")
    return `${waiting}is waiting for its original workspace. Review the owning chat or remove the item.`;
  if (paused)
    return otherConversation
      ? "Delivery is paused at an earlier message in another chat."
      : "Delivery is paused. Resume when you’re ready.";
  if (!runtimeReady || hydration === "checking")
    return `${waiting}is waiting for its agent to be ready.`;
  if (hydration === "unavailable")
    return `${waiting}is waiting for run recovery. Retry the run list in its chat.`;
  if (busy)
    return `${waiting}is waiting for that chat’s active turn to finish.`;
  return otherConversation
    ? "An earlier message in another chat is ahead of this one."
    : "";
}
