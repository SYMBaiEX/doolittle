export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export type LogKind = "event" | "crash";

export interface LoggerRecord {
  at: string;
  seq: number;
  pid: number;
  logger: string;
  scope: string;
  kind: LogKind;
  level: LogLevel;
  message: string;
  detail?: string;
  tags?: string[];
  fields?: Record<string, unknown>;
}

export interface LoggerRedactionOptions {
  keys?: string[];
  pathFragments?: string[];
  placeholder?: string;
}

export interface LoggerSerializationOptions {
  maxDepth?: number;
  maxArrayLength?: number;
  maxObjectEntries?: number;
}

export interface LoggerSerializerMap {
  error?: (error: Error) => unknown;
  fallback?: (value: unknown, path: string[]) => unknown;
}

export interface LoggerTransport {
  name?: string;
  minLevel?: LogLevel;
  kinds?: LogKind[];
  write(record: LoggerRecord): void | Promise<void>;
  flush?(): void | Promise<void>;
  close?(): void | Promise<void>;
}

export interface LogEntryOptions {
  detail?: string;
  fields?: Record<string, unknown>;
  tags?: string[];
}

export interface LoggerOptions {
  name?: string;
  scope?: string;
  minLevel?: LogLevel;
  traceEnabled?: boolean;
  bindings?: Record<string, unknown>;
  tags?: string[];
  transports?: LoggerTransport[];
  redact?: LoggerRedactionOptions;
  serialization?: LoggerSerializationOptions;
  serializers?: LoggerSerializerMap;
  clock?: () => Date;
}

export interface LoggerPreset {
  readonly name: string;
  readonly scope: string;
  readonly defaults: Readonly<LoggerOptions>;
  create(options?: LoggerOptions): Logger;
  child(scope: string, bindings?: Record<string, unknown>): LoggerPreset;
  withFields(bindings: Record<string, unknown>): LoggerPreset;
  withTags(...tags: string[]): LoggerPreset;
  withOptions(options: LoggerOptions): LoggerPreset;
}

export interface Logger {
  readonly name: string;
  readonly scope: string;
  child(scope: string, bindings?: Record<string, unknown>): Logger;
  withFields(bindings: Record<string, unknown>): Logger;
  withTags(...tags: string[]): Logger;
  isLevelEnabled(level: LogLevel): boolean;
  log(level: LogLevel, message: string, options?: LogEntryOptions): void;
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
}

export interface JsonlFileTransportOptions {
  path: string;
  minLevel?: LogLevel;
  kinds?: LogKind[];
}

export interface CrashFileTransportOptions {
  path: string;
  minLevel?: LogLevel;
  kinds?: LogKind[];
  includeFields?: boolean;
}

export interface PrettyConsoleTransportOptions {
  stream?: Pick<NodeJS.WriteStream, "write" | "isTTY">;
  minLevel?: LogLevel;
  kinds?: LogKind[];
  color?: boolean;
  showTags?: boolean;
}

export interface MemoryTransportOptions {
  limit?: number;
  minLevel?: LogLevel;
  kinds?: LogKind[];
}

export interface MemoryTransport extends LoggerTransport {
  records(): LoggerRecord[];
  clear(): void;
}
