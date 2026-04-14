import { createPrettyConsoleTransport, type LogLevel } from "@doolittle/logger";

export interface LoggerServiceOptions {
  scope?: string;
  minLevel?: LogLevel;
  traceEnabled?: boolean;
  eventLogPath?: string;
  crashLogPath?: string;
  stdoutTransport?: boolean;
  name?: string;
  defaultFields?: Record<string, unknown>;
  tags?: string[];
}

export function normalizeMinLevel(value?: string): LogLevel {
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

export function buildOptionalConsoleTransports(
  stdoutTransport: boolean | undefined,
  minLevel: LogLevel,
) {
  if (!(stdoutTransport ?? process.env.DOOLITTLE_LOG_STDOUT === "1")) {
    return [];
  }
  return [
    createPrettyConsoleTransport({
      minLevel,
      color:
        process.env.DOOLITTLE_LOG_PRETTY === "0" ? false : process.stderr.isTTY,
    }),
  ];
}

export function mergeTags(base: string[], next?: string[]): string[] {
  return [
    ...new Set(
      [...base, ...(next ?? [])].map((tag) => tag.trim()).filter(Boolean),
    ),
  ];
}
