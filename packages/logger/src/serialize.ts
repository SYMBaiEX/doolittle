import type {
  LoggerRedactionOptions,
  LoggerSerializationOptions,
  LoggerSerializerMap,
} from "./types";

const DEFAULT_REDACT_KEYS = [
  "access_token",
  "api_key",
  "apikey",
  "authorization",
  "cookie",
  "password",
  "refresh_token",
  "secret",
  "set-cookie",
  "token",
];

const DEFAULT_REDACTION_PLACEHOLDER = "[REDACTED]";

const DEFAULT_SERIALIZATION: Required<LoggerSerializationOptions> = {
  maxDepth: 6,
  maxArrayLength: 40,
  maxObjectEntries: 40,
};

interface SerializeContext {
  readonly redactKeys: Set<string>;
  readonly redactPathFragments: string[];
  readonly redactPlaceholder: string;
  readonly serialization: Required<LoggerSerializationOptions>;
  readonly serializers?: LoggerSerializerMap;
  readonly seen: WeakSet<object>;
}

export function formatLoggerError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || error.message || String(error);
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function normalizeLogFields(
  fields: Record<string, unknown> | undefined,
  options: {
    redact?: LoggerRedactionOptions;
    serialization?: LoggerSerializationOptions;
    serializers?: LoggerSerializerMap;
  } = {},
): Record<string, unknown> | undefined {
  if (!fields) {
    return undefined;
  }
  const context: SerializeContext = {
    redactKeys: new Set(
      [...DEFAULT_REDACT_KEYS, ...(options.redact?.keys ?? [])].map((key) =>
        key.toLowerCase(),
      ),
    ),
    redactPathFragments: (options.redact?.pathFragments ?? []).map((fragment) =>
      fragment.toLowerCase(),
    ),
    redactPlaceholder:
      options.redact?.placeholder ?? DEFAULT_REDACTION_PLACEHOLDER,
    serialization: {
      ...DEFAULT_SERIALIZATION,
      ...(options.serialization ?? {}),
    },
    serializers: options.serializers,
    seen: new WeakSet<object>(),
  };
  return normalizeValue(fields, context, [], 0) as Record<string, unknown>;
}

function normalizeValue(
  value: unknown,
  context: SerializeContext,
  path: string[],
  depth: number,
): unknown {
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "symbol") {
    return value.toString();
  }
  if (typeof value === "function") {
    return `[Function ${(value as { name?: string }).name || "anonymous"}]`;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof URL) {
    return value.toString();
  }
  if (value instanceof Error) {
    if (context.serializers?.error) {
      return context.serializers.error(value);
    }
    return normalizeError(value, context, path, depth);
  }
  if (depth >= context.serialization.maxDepth) {
    return "[MaxDepth]";
  }
  if (Array.isArray(value)) {
    return normalizeArray(value, context, path, depth);
  }
  if (value instanceof Map) {
    return normalizeValue(
      Object.fromEntries(value.entries()),
      context,
      path,
      depth + 1,
    );
  }
  if (value instanceof Set) {
    return normalizeArray([...value.values()], context, path, depth + 1);
  }
  if (typeof value === "object") {
    if (context.seen.has(value)) {
      return "[Circular]";
    }
    context.seen.add(value);
    const normalized = normalizeObject(
      value as Record<string, unknown>,
      context,
      path,
      depth,
    );
    context.seen.delete(value);
    return normalized;
  }
  if (context.serializers?.fallback) {
    return context.serializers.fallback(value, path);
  }
  return String(value);
}

function normalizeError(
  error: Error,
  context: SerializeContext,
  path: string[],
  depth: number,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    name: error.name,
    message: error.message,
  };
  if (error.stack) {
    base.stack = error.stack;
  }
  const withCause = error as Error & {
    cause?: unknown;
    code?: unknown;
    syscall?: unknown;
    errors?: unknown;
  };
  if (withCause.code !== undefined) {
    base.code = withCause.code;
  }
  if (withCause.syscall !== undefined) {
    base.syscall = withCause.syscall;
  }
  if (withCause.cause !== undefined) {
    base.cause = normalizeValue(
      withCause.cause,
      context,
      [...path, "cause"],
      depth + 1,
    );
  }
  if (Array.isArray(withCause.errors)) {
    base.errors = normalizeValue(
      withCause.errors,
      context,
      [...path, "errors"],
      depth + 1,
    );
  }
  return base;
}

function normalizeArray(
  values: unknown[],
  context: SerializeContext,
  path: string[],
  depth: number,
): unknown[] {
  const normalized = values
    .slice(0, context.serialization.maxArrayLength)
    .map((entry, index) =>
      normalizeValue(entry, context, [...path, String(index)], depth + 1),
    );
  if (values.length > context.serialization.maxArrayLength) {
    normalized.push(
      `[+${values.length - context.serialization.maxArrayLength} more]`,
    );
  }
  return normalized;
}

function normalizeObject(
  value: Record<string, unknown>,
  context: SerializeContext,
  path: string[],
  depth: number,
): Record<string, unknown> {
  const entries = Object.entries(value);
  const normalized: Record<string, unknown> = {};
  for (const [key, entry] of entries.slice(
    0,
    context.serialization.maxObjectEntries,
  )) {
    const nextPath = [...path, key];
    if (shouldRedact(key, nextPath, context)) {
      normalized[key] = context.redactPlaceholder;
      continue;
    }
    normalized[key] = normalizeValue(entry, context, nextPath, depth + 1);
  }
  if (entries.length > context.serialization.maxObjectEntries) {
    normalized._truncated =
      entries.length - context.serialization.maxObjectEntries;
  }
  return normalized;
}

function shouldRedact(
  key: string,
  path: string[],
  context: SerializeContext,
): boolean {
  if (context.redactKeys.has(key.toLowerCase())) {
    return true;
  }
  if (!context.redactPathFragments.length) {
    return false;
  }
  const joinedPath = path.join(".").toLowerCase();
  return context.redactPathFragments.some((fragment) =>
    joinedPath.includes(fragment),
  );
}
