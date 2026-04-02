import { isLevelEnabled, normalizeLogLevel } from "./levels";
import { formatLoggerError, normalizeLogFields } from "./serialize";
import { createPrettyConsoleTransport } from "./transports";
import type {
  LogEntryOptions,
  Logger,
  LoggerOptions,
  LoggerRecord,
  LoggerTransport,
  LogKind,
  LogLevel,
} from "./types";

interface LoggerState {
  name: string;
  minLevel: LogLevel;
  traceEnabled: boolean;
  transports: LoggerTransport[];
  redact: LoggerOptions["redact"];
  serialization: LoggerOptions["serialization"];
  serializers: LoggerOptions["serializers"];
  clock: () => Date;
  sequence: number;
}

interface LoggerScopeState {
  scope: string;
  bindings?: Record<string, unknown>;
  tags: string[];
}

export const DOCTOR_LOGGER_CODENAME = "Dr. Mochibi";

export function createLogger(options: LoggerOptions = {}): Logger {
  const state: LoggerState = {
    name: options.name?.trim() || "doolittle",
    minLevel: normalizeLogLevel(options.minLevel),
    traceEnabled: options.traceEnabled ?? false,
    transports: options.transports ?? [createPrettyConsoleTransport()],
    redact: options.redact,
    serialization: options.serialization,
    serializers: options.serializers,
    clock: options.clock ?? (() => new Date()),
    sequence: 0,
  };
  return new StructuredLogger(state, {
    scope: options.scope?.trim() || state.name,
    bindings: options.bindings,
    tags: mergeTags([], options.tags),
  });
}

export function createNoopLogger(): Logger {
  return createLogger({
    name: "noop",
    scope: "noop",
    minLevel: "fatal",
    traceEnabled: false,
    transports: [],
  });
}

class StructuredLogger implements Logger {
  readonly name: string;
  readonly scope: string;

  constructor(
    private readonly state: LoggerState,
    private readonly scopeState: LoggerScopeState,
  ) {
    this.name = state.name;
    this.scope = scopeState.scope;
  }

  child(scope: string, bindings?: Record<string, unknown>): Logger {
    return new StructuredLogger(this.state, {
      scope: joinScope(this.scopeState.scope, scope),
      bindings: mergeFields(this.scopeState.bindings, bindings),
      tags: [...this.scopeState.tags],
    });
  }

  withFields(bindings: Record<string, unknown>): Logger {
    return new StructuredLogger(this.state, {
      scope: this.scopeState.scope,
      bindings: mergeFields(this.scopeState.bindings, bindings),
      tags: [...this.scopeState.tags],
    });
  }

  withTags(...tags: string[]): Logger {
    return new StructuredLogger(this.state, {
      scope: this.scopeState.scope,
      bindings: this.scopeState.bindings
        ? { ...this.scopeState.bindings }
        : undefined,
      tags: mergeTags(this.scopeState.tags, tags),
    });
  }

  isLevelEnabled(level: LogLevel): boolean {
    if (level === "trace") {
      return this.state.traceEnabled;
    }
    return isLevelEnabled(this.state.minLevel, level);
  }

  log(level: LogLevel, message: string, options: LogEntryOptions = {}): void {
    if (!this.isLevelEnabled(level)) {
      return;
    }
    this.dispatch(this.createRecord("event", level, message, options), false);
  }

  trace(
    message: string,
    detail?: string | Record<string, unknown>,
    fields?: Record<string, unknown>,
  ): void {
    if (typeof detail === "string") {
      this.log("trace", message, { detail, fields });
      return;
    }
    this.log("trace", message, { fields: detail });
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
    const crashFields = {
      ...fields,
      crash: true,
      error: detail,
    };
    this.dispatch(
      this.createRecord("event", "error", label, {
        fields: crashFields,
      }),
      true,
    );
    this.dispatch(
      this.createRecord("crash", "error", label, {
        detail,
        fields,
      }),
      true,
    );
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

  async flush(): Promise<void> {
    for (const transport of new Set(this.state.transports)) {
      await transport.flush?.();
    }
  }

  async close(): Promise<void> {
    await this.flush();
    for (const transport of new Set(this.state.transports)) {
      await transport.close?.();
    }
  }

  private createRecord(
    kind: LogKind,
    level: LogLevel,
    message: string,
    options: LogEntryOptions,
  ): LoggerRecord {
    const fields = normalizeLogFields(
      mergeFields(this.scopeState.bindings, options.fields),
      {
        redact: this.state.redact,
        serialization: this.state.serialization,
        serializers: this.state.serializers,
      },
    );
    const tags = mergeTags(this.scopeState.tags, options.tags);
    return {
      at: this.state.clock().toISOString(),
      seq: ++this.state.sequence,
      pid: process.pid,
      logger: this.state.name,
      scope: this.scopeState.scope,
      kind,
      level,
      message,
      detail: options.detail,
      tags: tags.length ? tags : undefined,
      fields,
    };
  }

  private dispatch(record: LoggerRecord, force: boolean): void {
    for (const transport of this.state.transports) {
      if (
        !force &&
        transport.minLevel &&
        !isLevelEnabled(transport.minLevel, record.level)
      ) {
        continue;
      }
      if (transport.kinds?.length && !transport.kinds.includes(record.kind)) {
        continue;
      }
      try {
        void transport.write(record);
      } catch {
        // Best effort only.
      }
    }
  }
}

function joinScope(base: string, scope: string): string {
  const normalized = scope.trim();
  if (!normalized) {
    return base;
  }
  return `${base}.${normalized}`;
}

function mergeFields(
  left?: Record<string, unknown>,
  right?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!left && !right) {
    return undefined;
  }
  return {
    ...(left ?? {}),
    ...(right ?? {}),
  };
}

function mergeTags(left: string[], right?: string[]): string[] {
  const values = [...left, ...(right ?? [])]
    .map((tag) => tag.trim())
    .filter(Boolean);
  return [...new Set(values)];
}
