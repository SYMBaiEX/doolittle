import type { Logger, LogLevel } from "@doolittle/logger";
import {
  type AppLogger,
  type AppLogRecord,
  formatLoggerError,
} from "@/logging/logger";
import type { LoggerServiceOptions } from "./options";
import { readLoggerServiceRecords } from "./records";
import { createLoggerServiceState, type LoggerServiceState } from "./state";

export class LoggerService implements AppLogger {
  private logger: Logger;
  private eventLogPath: string;
  private crashLogPath: string;

  constructor(dataDir: string, options: LoggerServiceOptions = {}) {
    const state = createLoggerServiceState(dataDir, options);
    this.logger = state.logger;
    this.eventLogPath = state.eventLogPath;
    this.crashLogPath = state.crashLogPath;
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
    return readLoggerServiceRecords(this.eventLogPath, limit);
  }

  flush(): Promise<void> {
    return this.logger.flush();
  }

  close(): Promise<void> {
    return this.logger.close();
  }
}

export type { LoggerServiceOptions };
export { formatLoggerError };
