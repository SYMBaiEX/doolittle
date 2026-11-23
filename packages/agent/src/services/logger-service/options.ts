import type { AppLogLevel } from "../../logging/logger";

export interface LoggerServiceOptions {
  scope?: string;
  minLevel?: AppLogLevel;
  traceEnabled?: boolean;
  eventLogPath?: string;
  crashLogPath?: string;
  name?: string;
  defaultFields?: Record<string, unknown>;
  tags?: string[];
}

export function normalizeMinLevel(value?: string): AppLogLevel {
  const normalized = (value ?? "").trim().toLowerCase();
  switch (normalized) {
    case "trace":
    case "debug":
    case "info":
    case "warn":
    case "error":
    case "fatal":
      return normalized;
    default:
      return "info";
  }
}

export function mergeTags(base: string[], next?: string[]): string[] {
  return [
    ...new Set(
      [...base, ...(next ?? [])].map((tag) => tag.trim()).filter(Boolean),
    ),
  ];
}
