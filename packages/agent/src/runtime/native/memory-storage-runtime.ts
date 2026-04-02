import {
  Service as ElizaService,
  type IAgentRuntime,
  type Service,
} from "@elizaos/core";
import type {
  AdvancedLongTermMemory,
  AdvancedLongTermMemoryCategory,
  AdvancedSessionSummary,
  SessionService,
} from "@/services/session/service";

export function createMemoryStorageRuntimeService(sessions: SessionService) {
  class MemoryStorageRuntimeService extends ElizaService {
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
        AdvancedLongTermMemory,
        "id" | "createdAt" | "updatedAt" | "accessCount"
      >,
    ) {
      return sessions.storeLongTermMemory(memory);
    }

    getLongTermMemories(
      agentId: string,
      entityId: string,
      opts?: {
        category?: AdvancedLongTermMemoryCategory;
        limit?: number;
      },
    ) {
      return sessions.getLongTermMemories(agentId, entityId, opts);
    }

    updateLongTermMemory(
      id: string,
      agentId: string,
      entityId: string,
      updates: Partial<
        Omit<
          AdvancedLongTermMemory,
          "id" | "agentId" | "entityId" | "createdAt"
        >
      >,
    ) {
      return sessions.updateLongTermMemory(id, agentId, entityId, updates);
    }

    deleteLongTermMemory(id: string, agentId: string, entityId: string) {
      return sessions.deleteLongTermMemory(id, agentId, entityId);
    }

    storeSessionSummary(
      summary: Omit<AdvancedSessionSummary, "id" | "createdAt" | "updatedAt">,
    ) {
      return sessions.storeSessionSummary(summary);
    }

    getCurrentSessionSummary(agentId: string, roomId: string) {
      return sessions.getCurrentSessionSummary(agentId, roomId);
    }

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
    ) {
      return sessions.updateSessionSummary(id, agentId, roomId, updates);
    }

    getSessionSummaries(agentId: string, roomId: string, limit?: number) {
      return sessions.getSessionSummaries(agentId, roomId, limit);
    }
  }

  return MemoryStorageRuntimeService;
}
