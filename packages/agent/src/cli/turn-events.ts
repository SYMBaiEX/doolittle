import {
  sanitizeSingleLineTerminalText,
  sanitizeTerminalText,
} from "@/cli/render-utils";

export type CliTurnEvent =
  | {
      type: "start";
      timestamp: string;
      sessionId: string;
      command: string;
    }
  | {
      type: "progress";
      timestamp: string;
      phase: "command" | "readiness" | "model";
      chunk: string;
      response: string;
      delta: string;
    }
  | {
      type: "notice";
      timestamp: string;
      kind: "context" | "skills" | "status";
      message: string;
    }
  | {
      type: "run";
      timestamp: string;
      runEventType: string;
      detail: string;
    }
  | {
      type: "result";
      timestamp: string;
      text: string;
      tone: "info" | "success" | "warning" | "error" | "agent";
      shouldExit: boolean;
    }
  | {
      type: "error";
      timestamp: string;
      message: string;
    }
  | {
      type: "completed";
      timestamp: string;
      status: "completed" | "failed" | "cancelled";
      elapsedMs?: number;
    };

export function encodeCliTurnEvent(event: CliTurnEvent): string {
  return `${JSON.stringify(event)}\n`;
}

export function parseCliTurnEvent(line: string): CliTurnEvent | undefined {
  const trimmed = line.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed) as { type?: string };
    if (!parsed || typeof parsed.type !== "string") {
      return undefined;
    }
    return parsed as CliTurnEvent;
  } catch {
    return undefined;
  }
}

function formatElapsedMs(elapsedMs?: number): string | undefined {
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

export function renderCliTurnEvent(event: CliTurnEvent): string {
  switch (event.type) {
    case "start":
      return `job started · session ${sanitizeSingleLineTerminalText(event.sessionId)} · ${sanitizeSingleLineTerminalText(event.command)}`;
    case "progress":
      return sanitizeTerminalText(event.delta || event.response || event.chunk);
    case "notice":
      return `${event.kind}: ${sanitizeTerminalText(event.message)}`;
    case "run":
      return `[run] ${sanitizeTerminalText(event.detail)}`;
    case "result":
      return sanitizeTerminalText(event.text);
    case "error":
      return `error: ${sanitizeTerminalText(event.message)}`;
    case "completed":
      return `job ${event.status}${formatElapsedMs(event.elapsedMs) ? ` · ${formatElapsedMs(event.elapsedMs)}` : ""}`;
  }
}
