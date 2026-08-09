export type UnknownRecord = Record<string, unknown>;

/**
 * Broad object guard for runtime payloads. This intentionally accepts objects
 * with custom prototypes; callers that require plain JSON objects should use
 * the official `isPlainObject` guard instead.
 */
export function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
