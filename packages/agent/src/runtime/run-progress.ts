import type { RunUpdateEvent } from "@/services/run-controller-service";

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

export function shouldRenderRunEvent(
  mode: "off" | "new" | "all" | "verbose",
  event: RunUpdateEvent,
): boolean {
  if (mode === "off") {
    return false;
  }
  if (mode === "new") {
    if (event.type === "stream") {
      return event.run.activeStream !== "assistant";
    }
    return [
      "started",
      "thinking",
      "action-started",
      "action-completed",
      "waiting",
      "completed",
      "error",
      "approvals",
    ].includes(event.type);
  }
  if (mode === "all") {
    return event.type !== "message" && event.type !== "heartbeat";
  }
  return true;
}

export function formatRunEvent(
  event: RunUpdateEvent,
  limit = 88,
): string | undefined {
  switch (event.type) {
    case "started":
      return `run started · ${event.run.runDepth} · cap ${event.run.configuredMaxIterations}`;
    case "thinking":
      return event.run.statusDetail
        ? `thinking · ${truncate(event.run.statusDetail, limit)}`
        : "thinking";
    case "acting":
    case "action-started":
      return event.run.activeAction
        ? `tool ${event.run.observedActionCount} · ${event.run.activeStream ? `${event.run.activeStream} · ` : ""}${truncate(event.run.activeAction, limit)}`
        : `acting · ${event.run.observedActionCount} observed steps`;
    case "action-completed":
      return event.run.lastAction
        ? `tool done · ${truncate(event.run.lastAction, limit)}`
        : "action completed";
    case "waiting":
      return event.run.statusDetail
        ? `waiting · ${truncate(event.run.statusDetail, limit)}`
        : "waiting for next step";
    case "stream":
      return event.run.activeStream
        ? `${event.run.activeStream} · ${truncate(event.run.statusDetail ?? event.run.activeAction ?? "activity", limit)}`
        : "stream activity";
    case "heartbeat":
      return event.run.statusDetail
        ? `heartbeat · ${truncate(event.run.statusDetail, limit)}`
        : "heartbeat";
    case "approvals":
      return `pending approvals · ${event.run.pendingApprovals}`;
    case "completed":
      return `run complete · ${event.run.observedActionCount} observed steps`;
    case "error":
      return event.run.errorMessage
        ? `run error · ${truncate(event.run.errorMessage, Math.max(limit, 120))}`
        : "run error";
    case "message":
      return undefined;
    default:
      return undefined;
  }
}
