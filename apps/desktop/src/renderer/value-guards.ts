import {
  asRecord as asElizaRecord,
  isPlainObject,
} from "@elizaos/shared/type-guards";

export { isPlainObject };

export function asRecord(value: unknown): Record<string, unknown> {
  return asElizaRecord(value) ?? {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
