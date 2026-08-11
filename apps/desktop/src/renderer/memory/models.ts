import type { UnknownRecord } from "../lib";

export type MemorySection = "shared" | "user" | "profiles";

export interface MemorySummary {
  target?: "memory" | "user" | string;
  entries?: number;
  characters?: number;
  preview?: unknown[];
}

export interface MemoryResponse {
  target?: string;
  summary?: MemorySummary;
  snapshot?: string;
}

export interface ProfileSummaryResponse {
  summary?: UnknownRecord;
}

export interface AgentProfileResponse {
  card?: unknown;
  summary?: UnknownRecord;
}

export interface MemoryResourcePolicy {
  shared: boolean;
  user: boolean;
  profiles: boolean;
}

export function memoryResourcePolicy(
  section: MemorySection,
  active: boolean,
): MemoryResourcePolicy {
  return {
    shared: active && section === "shared",
    user: active && section === "user",
    profiles: active && section === "profiles",
  };
}
