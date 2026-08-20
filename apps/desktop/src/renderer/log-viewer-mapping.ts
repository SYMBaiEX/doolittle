import { asRecord, asString } from "./lib";

type LogLevelTone = "debug" | "error" | "info" | "trace" | "warn";

export interface RuntimeLogEntry {
  id: string;
  level: string;
  message: string;
  timestamp?: string;
}

function logLevelTone(level: unknown): LogLevelTone {
  const normalized = asString(level, "info").toLowerCase();
  if (normalized === "fatal" || normalized === "error") return "error";
  if (normalized === "warn" || normalized === "warning") return "warn";
  if (normalized === "debug") return "debug";
  if (normalized === "trace") return "trace";
  return "info";
}

export function logEntryTone(level: string): "neutral" | "warn" | "bad" {
  const tone = logLevelTone(level);
  if (tone === "error") return "bad";
  if (tone === "warn") return "warn";
  return "neutral";
}

export function logEntryClassName(
  entry: Pick<RuntimeLogEntry, "level">,
): string {
  const tone = logLevelTone(entry.level);
  if (tone === "debug" || tone === "trace") {
    return "opacity-75";
  }
  if (tone === "warn") {
    return "[&_[data-slot=badge]]:border-[color-mix(in_srgb,var(--warning)_48%,var(--border))] [&_[data-slot=badge]]:text-[var(--warning)]";
  }
  if (tone === "info") {
    return "[&_[data-slot=badge]]:border-[var(--line-subtle)] [&_[data-slot=badge]]:bg-[color-mix(in_srgb,var(--surface-raised)_82%,transparent)] [&_[data-slot=badge]]:text-[var(--muted)]";
  }
  return "";
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
export function toLogViewerEntries(logs: unknown[]): RuntimeLogEntry[] {
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
