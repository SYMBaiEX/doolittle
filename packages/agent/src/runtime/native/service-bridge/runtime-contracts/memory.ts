import type { MemoryStorageProvider } from "@elizaos/core";
import type { SessionSearchResult } from "@/types";

export interface NativeMemoryStorageService extends MemoryStorageProvider {
  searchSessions(query: string, limit: number): SessionSearchResult[];
}

export interface NativePersonalityService {
  list(): unknown[];
  get(id: string): unknown;
  activate(id: string): unknown;
  activeId(): string | undefined;
  summary(): unknown;
}

export interface NativeRolodexService {
  list(): unknown[];
  get(userId: string): unknown;
  card(userId: string): unknown;
  remember(
    userId: string,
    kind: string,
    text: string,
    source?: string,
  ): unknown;
  recall(userId: string, query: string): unknown;
  observeAgent(text: string, source?: string): unknown;
  observe(
    userId: string,
    message: string,
    source?: string,
    context?: {
      source?: string;
      channel?: string;
      sessionId?: string;
      signal?: string;
    },
  ): unknown;
  context(userId: string, query: string): unknown;
  conclude(
    userId: string,
    query: string,
    conclusion: string,
    source?: string,
  ): unknown;
  setMode(userId: string, mode: "local" | "hybrid"): unknown;
  configureModeling(
    userId: string,
    settings: {
      userMemoryMode?: "local" | "hybrid";
      assistantMemoryMode?: "local" | "hybrid";
      dialecticMode?: "off" | "assist" | "conclude";
    },
  ): unknown;
  seedAgent(seed: {
    name?: string;
    goals?: string[];
    strengths?: string[];
    workStyle?: string[];
    notes?: string[];
  }): unknown;
  agentProfile(): unknown;
  summary(): unknown;
  search(query: string, limit?: number): unknown;
  beliefs(userId: string): unknown;
  relationship(userId: string): unknown;
  engagement(userId: string): unknown;
}

export interface NativeExperienceService {
  usage(sessionId: string): unknown;
  recent(limit?: number): unknown;
  memorySnapshot(): unknown;
  summary(): unknown;
}
