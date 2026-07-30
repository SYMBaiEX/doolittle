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
import type { SessionService } from "@/services/session/service";

export function createMemoryStorageRuntimeService(sessions: SessionService) {
  class MemoryStorageRuntimeService
    extends ElizaService
    implements MemoryStorageProvider
  {
    static serviceType = "memoryStorage";
    capabilityDescription =
      "Provides advanced memory storage backed by Doolittle local state.";

    static async start(runtime: IAgentRuntime): Promise<Service> {
      return new MemoryStorageRuntimeService(runtime);
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
  }

  return MemoryStorageRuntimeService;
}
