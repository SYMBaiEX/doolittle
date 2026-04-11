import {
  createNoopLogger as createBaseNoopLogger,
  formatLoggerError,
  type Logger,
  type LogLevel,
} from "@doolittle/logger";

export type AppLogLevel = LogLevel;

export interface AppLogRecord {
  at: string;
  level: AppLogLevel;
  scope: string;
  message: string;
  detail?: string;
  fields?: Record<string, unknown>;
}

export interface AppLogger extends Logger {
  child(scope: string, bindings?: Record<string, unknown>): AppLogger;
  withFields(bindings: Record<string, unknown>): AppLogger;
  withTags(...tags: string[]): AppLogger;
  getEventLogPath(): string;
  getCrashLogPath(): string;
}

export { formatLoggerError };

export function createNoopLogger(): AppLogger {
  const wrap = (target: Logger): AppLogger => ({
    get name() {
      return target.name;
    },
    get scope() {
      return target.scope;
    },
    child(scope: string, bindings?: Record<string, unknown>) {
      return wrap(target.child(scope, bindings));
    },
    withFields(bindings: Record<string, unknown>) {
      return wrap(target.withFields(bindings));
    },
    withTags(...tags: string[]) {
      return wrap(target.withTags(...tags));
    },
    isLevelEnabled(level) {
      return target.isLevelEnabled(level);
    },
    log(level, message, options) {
      target.log(level, message, options);
    },
    trace(message, detail, fields) {
      target.trace(message, detail, fields);
    },
    debug(message, fields) {
      target.debug(message, fields);
    },
    info(message, fields) {
      target.info(message, fields);
    },
    warn(message, fields) {
      target.warn(message, fields);
    },
    error(message, fields) {
      target.error(message, fields);
    },
    fatal(message, fields) {
      target.fatal(message, fields);
    },
    recordCrash(label, detail, fields) {
      target.recordCrash(label, detail, fields);
    },
    captureError(label, error, fields) {
      return target.captureError(label, error, fields);
    },
    flush() {
      return target.flush();
    },
    close() {
      return target.close();
    },
    getEventLogPath() {
      return "";
    },
    getCrashLogPath() {
      return "";
    },
  });

  return wrap(createBaseNoopLogger());
}
