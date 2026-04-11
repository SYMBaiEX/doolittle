import type { LogLevel } from "./types";

export const LOG_LEVEL_WEIGHT: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

export function normalizeLogLevel(value?: string | LogLevel | null): LogLevel {
  switch ((value ?? "").trim().toLowerCase()) {
    case "trace":
    case "debug":
    case "info":
    case "warn":
    case "error":
    case "fatal":
      return value as LogLevel;
    default:
      return "info";
  }
}

export function isLevelEnabled(minLevel: LogLevel, level: LogLevel): boolean {
  return LOG_LEVEL_WEIGHT[level] >= LOG_LEVEL_WEIGHT[minLevel];
}
