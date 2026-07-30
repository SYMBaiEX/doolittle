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

/**
 * Exposes Doolittle's durable session projection through ElizaOS's official
 * advanced-memory service contract.
 *
 * The service is registered as part of the Doolittle plugin so AgentRuntime
 * owns its complete lifecycle. Product code must not inject service instances
 * into runtime internals.
 */
export function createMemoryStorageService(sessions: AppServices["sessions"]) {
  class DoolittleMemoryStorageService
    extends ElizaService
    implements MemoryStorageProvider
  {
    static serviceType = "memoryStorage";
    capabilityDescription =
      "Provides advanced memory storage backed by Doolittle local state.";

    static async start(runtime: IAgentRuntime): Promise<Service> {
      return new DoolittleMemoryStorageService(runtime);
    }

    async stop(): Promise<void> {
      return;
    }

    storeLongTermMemory(
      memory: Omit<
        LongTermMemory,
        "id" | "createdAt" | "updatedAt" | "accessCount"
      >,
    ) {
      return sessions.storeLongTermMemory(memory);
    }

    getLongTermMemories(
      agentId: UUID,
      entityId: UUID,
      opts?: {
        category?: LongTermMemoryCategory;
        limit?: number;
      },
    ) {
      return sessions.getLongTermMemories(agentId, entityId, opts);
    }

    updateLongTermMemory(
      id: UUID,
      agentId: UUID,
      entityId: UUID,
      updates: Partial<
        Omit<LongTermMemory, "id" | "agentId" | "entityId" | "createdAt">
      >,
    ) {
      return sessions.updateLongTermMemory(id, agentId, entityId, updates);
    }

    deleteLongTermMemory(id: UUID, agentId: UUID, entityId: UUID) {
      return sessions.deleteLongTermMemory(id, agentId, entityId);
    }

    storeSessionSummary(
      summary: Omit<SessionSummary, "id" | "createdAt" | "updatedAt">,
    ) {
      return sessions.storeSessionSummary(summary);
    }

    getCurrentSessionSummary(agentId: UUID, roomId: UUID) {
      return sessions.getCurrentSessionSummary(agentId, roomId);
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
      return sessions.updateSessionSummary(id, agentId, roomId, updates);
    }

    getSessionSummaries(agentId: UUID, roomId: UUID, limit?: number) {
      return sessions.getSessionSummaries(agentId, roomId, limit);
    }

    searchSessions(query: string, limit: number) {
      return sessions.search(query, limit);
    }
  }

  return DoolittleMemoryStorageService;
}
