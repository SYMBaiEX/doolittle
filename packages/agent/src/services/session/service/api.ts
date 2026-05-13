import type {
  SessionExchangeMutationResult,
  SessionSearchResult,
  SessionSummary,
  SessionUsageSummary,
  StoredMessage,
} from "@/types";
import type { SessionMessageActivityEvent } from "../messages";
import type { SessionMetadataValue } from "../metadata";
import type {
  AdvancedLongTermMemory,
  AdvancedLongTermMemoryCategory,
  AdvancedSessionSummary,
} from "./types";

export interface SessionServiceApi {
  storeMessage(message: StoredMessage): void;
  replaceSessionMessages(sessionId: string, messages: StoredMessage[]): void;
  deleteLatestExchange(
    sessionId: string,
    options?: { skipSlashCommands?: boolean },
  ): SessionExchangeMutationResult;
  onActivity(
    listener: (event: SessionMessageActivityEvent) => void,
  ): () => void;
  search(query: string, limit: number): SessionSearchResult[];
  recent(limit: number): SessionSearchResult[];
  recentBySession(sessionId: string, limit: number): SessionSearchResult[];
  messagesBySession(sessionId: string, limit: number): StoredMessage[];
  countBySessionRole(sessionId: string, role?: StoredMessage["role"]): number;
  latest(limit: number): SessionSearchResult[];
  summary(limit?: number): {
    totalSessions: number;
    recentSessionIds: string[];
  };
  summarize(sessionId: string, limit?: number): SessionSummary;
  listSessions(limit: number): SessionSummary[];
  listTitled(limit: number): SessionSummary[];
  resolveByTitle(query: string): SessionSummary | undefined;
  usage(sessionId: string): SessionUsageSummary;
  rename(sessionId: string, title: string): SessionSummary;
  metadata(sessionId: string): SessionMetadataValue | undefined;
  continuity(sessionId: string, limit?: number): SessionSummary[];
  continuityKey(sessionId: string): string;
  storeLongTermMemory(
    memory: Omit<
      AdvancedLongTermMemory,
      "id" | "createdAt" | "updatedAt" | "accessCount"
    >,
  ): Promise<AdvancedLongTermMemory>;
  getLongTermMemories(
    agentId: string,
    entityId: string,
    opts?: {
      category?: AdvancedLongTermMemoryCategory;
      limit?: number;
    },
  ): Promise<AdvancedLongTermMemory[]>;
  updateLongTermMemory(
    id: string,
    agentId: string,
    entityId: string,
    updates: Partial<
      Omit<AdvancedLongTermMemory, "id" | "agentId" | "entityId" | "createdAt">
    >,
  ): Promise<void>;
  deleteLongTermMemory(
    id: string,
    agentId: string,
    entityId: string,
  ): Promise<void>;
  storeSessionSummary(
    summary: Omit<AdvancedSessionSummary, "id" | "createdAt" | "updatedAt">,
  ): Promise<AdvancedSessionSummary>;
  getCurrentSessionSummary(
    agentId: string,
    roomId: string,
  ): Promise<AdvancedSessionSummary | null>;
  updateSessionSummary(
    id: string,
    agentId: string,
    roomId: string,
    updates: Partial<
      Omit<
        AdvancedSessionSummary,
        "id" | "agentId" | "roomId" | "createdAt" | "updatedAt"
      >
    >,
  ): Promise<void>;
  getSessionSummaries(
    agentId: string,
    roomId: string,
    limit?: number,
  ): Promise<AdvancedSessionSummary[]>;
}
