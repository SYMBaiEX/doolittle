export type AppLogLevel =
  | "trace"
  | "debug"
  | "info"
  | "warn"
  | "error"
  | "fatal";

export interface AppLogRecord {
  at: string;
  level: AppLogLevel;
  scope: string;
  message: string;
  detail?: string;
  fields?: Record<string, unknown>;
}

export interface AppLogger {
  readonly name: string;
  readonly scope: string;
  child(scope: string, bindings?: Record<string, unknown>): AppLogger;
  withFields(bindings: Record<string, unknown>): AppLogger;
  withTags(...tags: string[]): AppLogger;
  isLevelEnabled(level: AppLogLevel): boolean;
  log(
    level: AppLogLevel,
    message: string,
    options?: {
      detail?: string;
      fields?: Record<string, unknown>;
      tags?: string[];
    },
  ): void;
  trace(
    message: string,
    detail?: string | Record<string, unknown>,
    fields?: Record<string, unknown>,
  ): void;
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  fatal(message: string, fields?: Record<string, unknown>): void;
  recordCrash(
    label: string,
    detail: string,
    fields?: Record<string, unknown>,
  ): void;
  captureError(
    label: string,
    error: unknown,
    fields?: Record<string, unknown>,
  ): string;
  flush(): Promise<void>;
  close(): Promise<void>;
  getEventLogPath(): string;
  getCrashLogPath(): string;
}

export function formatLoggerError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || error.message || String(error);
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function createNoopLogger(): AppLogger {
  const noop = (scope = "noop"): AppLogger => ({
    name: "noop",
    scope,
    child(childScope) {
      return noop(childScope.trim() ? `${scope}.${childScope.trim()}` : scope);
    },
    withFields() {
      return this;
    },
    withTags() {
      return this;
    },
    isLevelEnabled() {
      return false;
    },
    log() {},
    trace() {},
    debug() {},
    info() {},
    warn() {},
    error() {},
    fatal() {},
    recordCrash() {},
    captureError(_label, error) {
      return formatLoggerError(error);
    },
    async flush() {},
    async close() {},
    getEventLogPath() {
      return "";
    },
    getCrashLogPath() {
      return "";
    },
  });
  return noop();
}
