import { createLogger } from "./logger";
import type { Logger, LoggerOptions, LoggerPreset } from "./types";

export function createLoggerPreset(options: LoggerOptions = {}): LoggerPreset {
  return new LoggerPresetImpl(normalizeLoggerOptions(options));
}

class LoggerPresetImpl implements LoggerPreset {
  readonly name: string;
  readonly scope: string;
  readonly defaults: Readonly<LoggerOptions>;

  constructor(defaults: LoggerOptions) {
    this.defaults = freezeLoggerOptions(defaults);
    this.name = this.defaults.name?.trim() || "doolittle";
    this.scope = this.defaults.scope?.trim() || this.name;
  }

  create(options: LoggerOptions = {}): Logger {
    return createLogger(mergeLoggerOptions(this.defaults, options));
  }

  child(scope: string, bindings?: Record<string, unknown>): LoggerPreset {
    return new LoggerPresetImpl(
      mergeLoggerOptions(this.defaults, {
        scope: joinScope(this.scope, scope),
        bindings: mergeFields(this.defaults.bindings, bindings),
      }),
    );
  }

  withFields(bindings: Record<string, unknown>): LoggerPreset {
    return new LoggerPresetImpl(
      mergeLoggerOptions(this.defaults, {
        bindings: mergeFields(this.defaults.bindings, bindings),
      }),
    );
  }

  withTags(...tags: string[]): LoggerPreset {
    return new LoggerPresetImpl(
      mergeLoggerOptions(this.defaults, {
        tags: mergeTags(this.defaults.tags, tags),
      }),
    );
  }

  withOptions(options: LoggerOptions): LoggerPreset {
    return new LoggerPresetImpl(mergeLoggerOptions(this.defaults, options));
  }
}

function normalizeLoggerOptions(options: LoggerOptions): LoggerOptions {
  return mergeLoggerOptions({}, options);
}

function mergeLoggerOptions(
  base: LoggerOptions,
  overrides: LoggerOptions = {},
): LoggerOptions {
  const name = normalizeText(overrides.name) ?? normalizeText(base.name);
  const scope = normalizeText(overrides.scope) ?? normalizeText(base.scope);
  const merged: LoggerOptions = {
    name: name || "doolittle",
    scope,
    minLevel: overrides.minLevel ?? base.minLevel,
    traceEnabled: overrides.traceEnabled ?? base.traceEnabled,
    bindings: mergeFields(base.bindings, overrides.bindings),
    tags: mergeTags(base.tags, overrides.tags),
    transports: overrides.transports ?? base.transports,
    redact: mergeObjects(base.redact, overrides.redact),
    serialization: mergeObjects(base.serialization, overrides.serialization),
    serializers: mergeObjects(base.serializers, overrides.serializers),
    clock: overrides.clock ?? base.clock,
  };
  return merged;
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

function mergeTags(left?: string[], right?: string[]): string[] | undefined {
  const values = [...(left ?? []), ...(right ?? [])]
    .map((tag) => tag.trim())
    .filter(Boolean);
  return values.length ? [...new Set(values)] : undefined;
}

function mergeObjects<T extends object>(left?: T, right?: T): T | undefined {
  if (!left && !right) {
    return undefined;
  }
  return {
    ...(left ?? {}),
    ...(right ?? {}),
  } as T;
}

function joinScope(base: string, scope: string): string {
  const normalized = scope.trim();
  if (!normalized) {
    return base;
  }
  return `${base}.${normalized}`;
}

function normalizeText(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function freezeLoggerOptions(options: LoggerOptions): Readonly<LoggerOptions> {
  return Object.freeze({
    ...options,
    bindings: options.bindings ? { ...options.bindings } : undefined,
    tags: options.tags ? [...options.tags] : undefined,
    redact: options.redact ? { ...options.redact } : undefined,
    serialization: options.serialization
      ? { ...options.serialization }
      : undefined,
    serializers: options.serializers ? { ...options.serializers } : undefined,
    transports: options.transports ? [...options.transports] : undefined,
  });
}
