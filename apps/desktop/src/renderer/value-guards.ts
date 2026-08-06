import { asRecord as asElizaRecord } from "@elizaos/shared/type-guards";

export function asRecord(value: unknown): Record<string, unknown> {
  return asElizaRecord(value) ?? {};
}
