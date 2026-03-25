import type {
  RunSnapshot,
  RunUpdateEvent,
} from "@/services/run-controller-service";

export interface ResponseTextAccumulator {
  text: string;
}

export type ResponseTextFrame = {
  delta: string;
  full: string;
};

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function parseRunTime(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function getRunElapsedMs(
  run: Pick<RunSnapshot, "startedAt" | "endedAt" | "updatedAt">,
): number | undefined {
  const startedAt = parseRunTime(run.startedAt);
  if (startedAt === undefined) {
    return undefined;
  }
  const finishedAt = parseRunTime(run.endedAt) ?? parseRunTime(run.updatedAt);
  if (finishedAt === undefined) {
    return undefined;
  }
  return Math.max(0, finishedAt - startedAt);
}

export function formatElapsedMs(elapsedMs?: number): string | undefined {
  if (elapsedMs === undefined) {
    return undefined;
  }
  if (elapsedMs < 1_000) {
    return `${Math.round(elapsedMs)}ms`;
  }
  const seconds = elapsedMs / 1_000;
  if (seconds < 10) {
    return `${seconds.toFixed(1)}s`;
  }
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function formatRunElapsed(
  run: Pick<RunSnapshot, "startedAt" | "endedAt" | "updatedAt">,
): string | undefined {
  return formatElapsedMs(getRunElapsedMs(run));
}

export function createResponseTextAccumulator(
  initialText = "",
): ResponseTextAccumulator {
  return { text: initialText };
}

export function nextResponseTextFrame(
  accumulator: ResponseTextAccumulator,
  nextText: string,
): ResponseTextFrame | undefined {
  if (nextText === accumulator.text) {
    return undefined;
  }
  if (!nextText) {
    accumulator.text = "";
    return undefined;
  }

  if (accumulator.text && nextText.startsWith(accumulator.text)) {
    const delta = nextText.slice(accumulator.text.length);
    accumulator.text = nextText;
    if (!delta) {
      return undefined;
    }
    return { delta, full: nextText };
  }

  accumulator.text = nextText;
  return { delta: nextText, full: nextText };
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
      return `run complete · ${event.run.observedActionCount} observed steps${formatRunElapsed(event.run) ? ` · ${formatRunElapsed(event.run)}` : ""}`;
    case "error":
      return event.run.errorMessage
        ? `run error${formatRunElapsed(event.run) ? ` · ${formatRunElapsed(event.run)}` : ""} · ${truncate(event.run.errorMessage, Math.max(limit, 120))}`
        : `run error${formatRunElapsed(event.run) ? ` · ${formatRunElapsed(event.run)}` : ""}`;
    case "message":
      return undefined;
    default:
      return undefined;
  }
}
