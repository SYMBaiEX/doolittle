import type { LogViewerStructuredEntry } from "@elizaos/ui/cloud-ui/components/log-viewer";
import { asRecord, asString } from "./lib";

type LogLevelTone = "debug" | "error" | "info" | "trace" | "warn";

function logLevelTone(level: unknown): LogLevelTone {
  const normalized = asString(level, "info").toLowerCase();
  if (normalized === "fatal" || normalized === "error") return "error";
  if (normalized === "warn" || normalized === "warning") return "warn";
  if (normalized === "debug") return "debug";
  if (normalized === "trace") return "trace";
  return "info";
}

export function logEntryClassName(entry: LogViewerStructuredEntry): string {
  return `log-console-entry is-${logLevelTone(entry.level)}`;
}

export function logEntryLevelVariant(
  level: string,
): "destructive" | "outline" | "secondary" {
  const tone = logLevelTone(level);
  if (tone === "error") return "destructive";
  if (tone === "info") return "secondary";
  return "outline";
}

export function logEntryBorderColor(level: string): string {
  switch (logLevelTone(level)) {
    case "error":
      return "var(--danger)";
    case "warn":
      return "var(--warning)";
    case "debug":
    case "trace":
      return "var(--muted)";
    default:
      return "var(--line-subtle)";
  }
}

/** Translates Doolittle's structured runtime events into the public UI viewer shape. */
export function toLogViewerEntries(
  logs: unknown[],
): LogViewerStructuredEntry[] {
  return logs.map((value, index) => {
    const entry = asRecord(value);
    const scope = asString(entry.scope, "runtime");
    const detail = asString(entry.detail);
    const message = asString(entry.message, "Event");
    const at = asString(entry.at);
    const renderedMessage = [scope, message, detail]
      .filter(Boolean)
      .join(" · ");

    return {
      id: `${at}:${scope}:${message}:${index}`,
      timestamp: at || undefined,
      level: asString(entry.level, "info"),
      message: renderedMessage,
    };
  });
}
