import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  createLogger as createElizaLogger,
  type Logger as ElizaLogger,
} from "@elizaos/logger";
import {
  type AppLogger,
  type AppLogLevel,
  type AppLogRecord,
  formatLoggerError,
} from "@/logging/logger";
import {
  type LoggerServiceOptions,
  mergeTags,
  normalizeMinLevel,
} from "./options";

const LEVEL_PRIORITY: Record<AppLogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const REDACTED = "[REDACTED]";

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[\s_.-]/gu, "").toLowerCase();
  return (
    normalized === "authorization" ||
    normalized === "bearer" ||
    normalized === "cookie" ||
    normalized === "credential" ||
    normalized === "credentials" ||
    normalized === "jwt" ||
    normalized === "session" ||
    normalized === "token" ||
    normalized.endsWith("apikey") ||
    normalized.endsWith("password") ||
    normalized.endsWith("privatekey") ||
    normalized.endsWith("secret") ||
    normalized.endsWith("token")
  );
}

interface LoggerState {
  name: string;
  minLevel: AppLogLevel;
  traceEnabled: boolean;
  eventLogPath: string;
  crashLogPath: string;
}

interface LoggerScope {
  scope: string;
  bindings?: Record<string, unknown>;
  tags: string[];
}

function sanitizeValue(
  value: unknown,
  key: string,
  seen: WeakSet<object>,
  depth: number,
): unknown {
  if (isSensitiveKey(key)) return REDACTED;
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "bigint" || typeof value === "symbol") {
    return String(value);
  }
  if (typeof value === "function") return "[Function]";
  if (value instanceof Date) return value.toISOString();
  if (value instanceof URL) return value.toString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(value.stack ? { stack: value.stack } : {}),
    };
  }
  if (depth >= 6) return "[MaxDepth]";
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  const result = Array.isArray(value)
    ? value
        .slice(0, 40)
        .map((entry, index) =>
          sanitizeValue(entry, String(index), seen, depth + 1),
        )
    : Object.fromEntries(
        Object.entries(value)
          .slice(0, 40)
          .map(([entryKey, entryValue]) => [
            entryKey,
            sanitizeValue(entryValue, entryKey, seen, depth + 1),
          ]),
      );
  seen.delete(value);
  return result;
}

function sanitizeFields(
  fields: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!fields || Object.keys(fields).length === 0) return undefined;
  return sanitizeValue(fields, "fields", new WeakSet(), 0) as Record<
    string,
    unknown
  >;
}

function mergeFields(
  left?: Record<string, unknown>,
  right?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!left && !right) return undefined;
  return { ...(left ?? {}), ...(right ?? {}) };
}

function joinScope(base: string, scope: string): string {
  const normalized = scope.trim();
  return normalized ? `${base}.${normalized}` : base;
}

function appendRecord(path: string, record: AppLogRecord): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
  } catch {
    // Official Eliza logging remains available if the local operations
    // projection cannot be persisted.
  }
}

function readRecordTail(path: string, limit: number): AppLogRecord[] {
  if (!existsSync(path)) return [];
  try {
    return readFileSync(path, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(-Math.max(1, limit))
      .flatMap((line) => {
        try {
          const record = JSON.parse(line) as AppLogRecord;
          return record && typeof record.message === "string" ? [record] : [];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

export class LoggerService implements AppLogger {
  private logger: ElizaLogger;
  private state: LoggerState;
  private scopeState: LoggerScope;

  constructor(dataDir: string, options: LoggerServiceOptions = {}) {
    const minLevel =
      options.minLevel ?? normalizeMinLevel(process.env.LOG_LEVEL);
    const scope = options.scope?.trim() || "doolittle";
    const traceEnabled = options.traceEnabled ?? minLevel === "trace";
    const state: LoggerState = {
      name: options.name?.trim() || "doolittle",
      minLevel,
      traceEnabled,
      eventLogPath:
        options.eventLogPath ?? join(dataDir, "logs", "doolittle.jsonl"),
      crashLogPath: options.crashLogPath ?? join(dataDir, "cli-crash.log"),
    };
    this.logger = createElizaLogger({
      level: traceEnabled ? "trace" : minLevel,
      namespace: scope,
      name: state.name,
    });
    this.state = state;
    this.scopeState = {
      scope,
      bindings: sanitizeFields(options.defaultFields),
      tags: mergeTags(["doolittle"], options.tags),
    };
  }

  private static fromState(
    logger: ElizaLogger,
    state: LoggerState,
    scopeState: LoggerScope,
  ): LoggerService {
    const service = Object.create(LoggerService.prototype) as LoggerService;
    service.logger = logger;
    service.state = state;
    service.scopeState = scopeState;
    return service;
  }

  get name(): string {
    return this.state.name;
  }

  get scope(): string {
    return this.scopeState.scope;
  }

  child(scope: string, bindings?: Record<string, unknown>): AppLogger {
    const nextScope = joinScope(this.scope, scope);
    return LoggerService.fromState(
      this.logger.child({ namespace: nextScope }),
      this.state,
      {
        scope: nextScope,
        bindings: sanitizeFields(
          mergeFields(this.scopeState.bindings, bindings),
        ),
        tags: [...this.scopeState.tags],
      },
    );
  }

  withFields(bindings: Record<string, unknown>): AppLogger {
    return LoggerService.fromState(this.logger, this.state, {
      ...this.scopeState,
      bindings: sanitizeFields(mergeFields(this.scopeState.bindings, bindings)),
    });
  }

  withTags(...tags: string[]): AppLogger {
    return LoggerService.fromState(this.logger, this.state, {
      ...this.scopeState,
      tags: mergeTags(this.scopeState.tags, tags),
    });
  }

  isLevelEnabled(level: AppLogLevel): boolean {
    if (level === "trace") return this.state.traceEnabled;
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.state.minLevel];
  }

  log(
    level: AppLogLevel,
    message: string,
    options: {
      detail?: string;
      fields?: Record<string, unknown>;
      tags?: string[];
    } = {},
  ): void {
    if (!this.isLevelEnabled(level)) return;
    const fields = sanitizeFields(
      mergeFields(this.scopeState.bindings, options.fields),
    );
    const tags = mergeTags(this.scopeState.tags, options.tags);
    const context = {
      ...(fields ? { context: fields } : {}),
      ...(options.detail ? { detail: options.detail } : {}),
      ...(tags.length ? { tags } : {}),
    };
    this.logger[level](context, message);
    appendRecord(this.state.eventLogPath, {
      at: new Date().toISOString(),
      level,
      scope: this.scope,
      message,
      ...(options.detail ? { detail: options.detail } : {}),
      ...(fields ? { fields } : {}),
    });
  }

  trace(
    message: string,
    detail?: string | Record<string, unknown>,
    fields?: Record<string, unknown>,
  ): void {
    this.log("trace", message, {
      ...(typeof detail === "string" ? { detail } : {}),
      fields: typeof detail === "string" ? fields : detail,
    });
  }

  debug(message: string, fields?: Record<string, unknown>): void {
    this.log("debug", message, { fields });
  }

  info(message: string, fields?: Record<string, unknown>): void {
    this.log("info", message, { fields });
  }

  warn(message: string, fields?: Record<string, unknown>): void {
    this.log("warn", message, { fields });
  }

  error(message: string, fields?: Record<string, unknown>): void {
    this.log("error", message, { fields });
  }

  fatal(message: string, fields?: Record<string, unknown>): void {
    this.log("fatal", message, { fields });
  }

  recordCrash(
    label: string,
    detail: string,
    fields?: Record<string, unknown>,
  ): void {
    const safeFields = sanitizeFields({ ...(fields ?? {}), crash: true });
    this.log("error", label, { detail, fields: safeFields });
    try {
      mkdirSync(dirname(this.state.crashLogPath), { recursive: true });
      appendFileSync(
        this.state.crashLogPath,
        `[${new Date().toISOString()}] ${label} (${this.scope})\n${detail}${safeFields ? `\nfields: ${JSON.stringify(safeFields, null, 2)}` : ""}\n\n`,
        "utf8",
      );
    } catch {
      // The crash already reached the official Eliza logger.
    }
  }

  captureError(
    label: string,
    error: unknown,
    fields?: Record<string, unknown>,
  ): string {
    const detail = formatLoggerError(error);
    this.recordCrash(label, detail, fields);
    return detail;
  }

  getEventLogPath(): string {
    return this.state.eventLogPath;
  }

  getCrashLogPath(): string {
    return this.state.crashLogPath;
  }

  list(limit = 100): AppLogRecord[] {
    return readRecordTail(this.state.eventLogPath, limit);
  }

  async flush(): Promise<void> {
    // @elizaos/logger is synchronous in the current SDK contract.
  }

  async close(): Promise<void> {
    // @elizaos/logger owns its process-level lifecycle.
  }
}

export type { LoggerServiceOptions };
export { formatLoggerError };
