import type { AppServices } from "@doolittle/agent/plugin-api";
import {
  Service as ElizaService,
  type IAgentRuntime,
  type LongTermMemory,
  type LongTermMemoryCategory,
  type MemoryStorageProvider,
  type Service,
  type SessionSummary,
  type UUID,
} from "@elizaos/core";
import { ElizaMemoryStorageStore } from "./memory-storage/store";

/**
 * Implements ElizaOS's official advanced-memory storage contract.
 *
 * AgentRuntime owns the store lifecycle. SessionService remains only the
 * product query projection used by searchSessions.
 */
export function createMemoryStorageService(
  sessions: AppServices["sessions"],
  dataDir: string,
) {
  class DoolittleMemoryStorageService
    extends ElizaService
    implements MemoryStorageProvider
  {
    static serviceType = "memoryStorage";
    private readonly store = new ElizaMemoryStorageStore(dataDir);
    capabilityDescription =
      "Provides Eliza advanced memory storage backed by local SQLite state.";

    static async start(runtime: IAgentRuntime): Promise<Service> {
      return new DoolittleMemoryStorageService(runtime);
    }

    async stop(): Promise<void> {
      this.store.close();
    }

    storeLongTermMemory(
      memory: Omit<
        LongTermMemory,
        "id" | "createdAt" | "updatedAt" | "accessCount"
      >,
    ) {
      return this.store.storeLongTermMemory(memory);
    }

    getLongTermMemories(
      agentId: UUID,
      entityId: UUID,
      opts?: {
        category?: LongTermMemoryCategory;
        limit?: number;
      },
    ) {
      return this.store.getLongTermMemories(agentId, entityId, opts);
    }

    updateLongTermMemory(
      id: UUID,
      agentId: UUID,
      entityId: UUID,
      updates: Partial<
        Omit<LongTermMemory, "id" | "agentId" | "entityId" | "createdAt">
      >,
    ) {
      return this.store.updateLongTermMemory(id, agentId, entityId, updates);
    }

    deleteLongTermMemory(id: UUID, agentId: UUID, entityId: UUID) {
      return this.store.deleteLongTermMemory(id, agentId, entityId);
    }

    storeSessionSummary(
      summary: Omit<SessionSummary, "id" | "createdAt" | "updatedAt">,
    ) {
      return this.store.storeSessionSummary(summary);
    }

    getCurrentSessionSummary(agentId: UUID, roomId: UUID) {
      return this.store.getCurrentSessionSummary(agentId, roomId);
    }

    updateSessionSummary(
      id: UUID,
      agentId: UUID,
      roomId: UUID,
      updates: Partial<
        Omit<
          SessionSummary,
          "id" | "agentId" | "roomId" | "createdAt" | "updatedAt"
        >
      >,
    ) {
      return this.store.updateSessionSummary(id, agentId, roomId, updates);
    }

    getSessionSummaries(agentId: UUID, roomId: UUID, limit?: number) {
      return this.store.getSessionSummaries(agentId, roomId, limit);
    }

    searchSessions(query: string, limit: number) {
      return sessions.search(query, limit);
    }
  }

  return DoolittleMemoryStorageService;
}
