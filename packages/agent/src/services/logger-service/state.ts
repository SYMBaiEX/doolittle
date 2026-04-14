import { join } from "node:path";
import {
  createCrashFileTransport,
  createJsonlFileTransport,
  createLogger,
  DOCTOR_LOGGER_CODENAME,
  type Logger,
} from "@doolittle/logger";
import {
  buildOptionalConsoleTransports,
  type LoggerServiceOptions,
  mergeTags,
  normalizeMinLevel,
} from "./options";

export interface LoggerServiceState {
  logger: Logger;
  eventLogPath: string;
  crashLogPath: string;
}

export function createLoggerServiceState(
  dataDir: string,
  options: LoggerServiceOptions = {},
): LoggerServiceState {
  const logsDir = join(dataDir, "logs");
  const eventLogPath = options.eventLogPath ?? join(logsDir, "doolittle.jsonl");
  const crashLogPath = options.crashLogPath ?? join(dataDir, "cli-crash.log");
  const minLevel =
    options.minLevel ?? normalizeMinLevel(process.env.DOOLITTLE_LOG_LEVEL);
  const traceEnabled =
    options.traceEnabled ?? process.env.DOOLITTLE_TUI_TRACE === "1";

  return {
    logger: createLogger({
      name: options.name ?? "doolittle",
      scope: options.scope ?? "doolittle",
      minLevel,
      traceEnabled,
      bindings: {
        ...(options.defaultFields ?? {}),
        codename: DOCTOR_LOGGER_CODENAME,
      },
      tags: mergeTags(["doolittle"], options.tags),
      redact: {
        keys: ["authorization", "token", "password", "secret", "apiKey"],
        pathFragments: ["credentials", "headers.authorization"],
      },
      transports: [
        createJsonlFileTransport({
          path: eventLogPath,
        }),
        createCrashFileTransport({
          path: crashLogPath,
          includeFields: true,
        }),
        ...buildOptionalConsoleTransports(options.stdoutTransport, minLevel),
      ],
    }),
    eventLogPath,
    crashLogPath,
  };
}
