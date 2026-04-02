import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  createCrashFileTransport,
  createJsonlFileTransport,
  createLogger,
  createPrettyConsoleTransport,
  DOCTOR_LOGGER_CODENAME,
  type Logger,
  type LogLevel,
  readJsonlTail,
} from "@doolittle/logger";
import {
  type AppLogger,
  type AppLogRecord,
  formatLoggerError,
} from "@/logging/logger";

interface LoggerServiceOptions {
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

interface LoggerServiceState {
  logger: Logger;
  eventLogPath: string;
  crashLogPath: string;
}

function normalizeMinLevel(value?: string): LogLevel {
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

export class LoggerService implements AppLogger {
  private logger: Logger;
  private eventLogPath: string;
  private crashLogPath: string;

  constructor(dataDir: string, options: LoggerServiceOptions = {}) {
    const logsDir = join(dataDir, "logs");
    const eventLogPath =
      options.eventLogPath ?? join(logsDir, "doolittle.jsonl");
    const crashLogPath = options.crashLogPath ?? join(dataDir, "cli-crash.log");
    const minLevel =
      options.minLevel ?? normalizeMinLevel(process.env.DOOLITTLE_LOG_LEVEL);
    const traceEnabled =
      options.traceEnabled ?? process.env.DOOLITTLE_TUI_TRACE === "1";

    this.logger = createLogger({
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
    });
    this.eventLogPath = eventLogPath;
    this.crashLogPath = crashLogPath;
  }

  private static fromState(state: LoggerServiceState): LoggerService {
    const service = Object.create(LoggerService.prototype) as LoggerService;
    service.logger = state.logger;
    service.eventLogPath = state.eventLogPath;
    service.crashLogPath = state.crashLogPath;
    return service;
  }

  get name(): string {
    return this.logger.name;
  }

  get scope(): string {
    return this.logger.scope;
  }

  child(scope: string, bindings?: Record<string, unknown>): AppLogger {
    return LoggerService.fromState({
      logger: this.logger.child(scope, bindings),
      eventLogPath: this.eventLogPath,
      crashLogPath: this.crashLogPath,
    });
  }

  withFields(bindings: Record<string, unknown>): AppLogger {
    return LoggerService.fromState({
      logger: this.logger.withFields(bindings),
      eventLogPath: this.eventLogPath,
      crashLogPath: this.crashLogPath,
    });
  }

  withTags(...tags: string[]): AppLogger {
    return LoggerService.fromState({
      logger: this.logger.withTags(...tags),
      eventLogPath: this.eventLogPath,
      crashLogPath: this.crashLogPath,
    });
  }

  isLevelEnabled(level: LogLevel): boolean {
    return this.logger.isLevelEnabled(level);
  }

  log(
    level: LogLevel,
    message: string,
    options?: {
      detail?: string;
      fields?: Record<string, unknown>;
      tags?: string[];
    },
  ): void {
    this.logger.log(level, message, options);
  }

  trace(
    message: string,
    detail?: string,
    data?: Record<string, unknown>,
  ): void {
    this.logger.trace(message, detail, data);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.logger.debug(message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.logger.info(message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.logger.warn(message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.logger.error(message, data);
  }

  fatal(message: string, data?: Record<string, unknown>): void {
    this.logger.fatal(message, data);
  }

  recordCrash(
    label: string,
    detail: string,
    data?: Record<string, unknown>,
  ): void {
    this.logger.recordCrash(label, detail, data);
  }

  captureError(
    label: string,
    error: unknown,
    data?: Record<string, unknown>,
  ): string {
    return this.logger.captureError(label, error, data);
  }

  getEventLogPath(): string {
    return this.eventLogPath;
  }

  getCrashLogPath(): string {
    return this.crashLogPath;
  }

  list(limit = 100): AppLogRecord[] {
    if (!existsSync(this.eventLogPath)) {
      return [];
    }
    return readJsonlTail(this.eventLogPath, limit, ["event"]);
  }

  flush(): Promise<void> {
    return this.logger.flush();
  }

  close(): Promise<void> {
    return this.logger.close();
  }
}

function buildOptionalConsoleTransports(
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

function mergeTags(base: string[], next?: string[]): string[] {
  return [
    ...new Set(
      [...base, ...(next ?? [])].map((tag) => tag.trim()).filter(Boolean),
    ),
  ];
}

export { formatLoggerError };
