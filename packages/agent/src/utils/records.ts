import {
  asRecord as asElizaRecord,
  type UnknownRecord,
} from "@elizaos/shared/type-guards";

export type { UnknownRecord };

/**
 * Compatibility predicate over Eliza's official broad record parser. Callers
 * that require plain JSON objects should use the official `isPlainObject`
 * guard instead.
 */
export function isRecord(value: unknown): value is UnknownRecord {
  return asElizaRecord(value) !== null;
}
