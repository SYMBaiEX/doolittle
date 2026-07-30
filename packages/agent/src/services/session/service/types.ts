import type {
  JsonPrimitive,
  JsonValue,
  LongTermMemory,
  LongTermMemoryCategory,
  SessionSummary,
} from "@elizaos/core";

/**
 * Compatibility names retained at the SessionService boundary while the
 * underlying contract is the official Eliza advanced-memory schema.
 */
export type AdvancedMemoryJsonValue = JsonValue;
export type AdvancedMemoryJsonPrimitive = JsonPrimitive;
export type AdvancedLongTermMemoryCategory = LongTermMemoryCategory;
export type AdvancedLongTermMemory = LongTermMemory;
export type AdvancedSessionSummary = SessionSummary;
