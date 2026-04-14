import type { SessionAdvancedMemoryStore } from "../advanced-memory";
import type {
  AdvancedLongTermMemory,
  AdvancedLongTermMemoryCategory,
  AdvancedSessionSummary,
} from "./types";

export class SessionAdvancedMemoryOperations {
  constructor(
    private readonly advancedMemoryStore: SessionAdvancedMemoryStore,
  ) {}

  storeLongTermMemory(
    memory: Omit<
      AdvancedLongTermMemory,
      "id" | "createdAt" | "updatedAt" | "accessCount"
    >,
  ): Promise<AdvancedLongTermMemory> {
    return this.advancedMemoryStore.storeLongTermMemory(memory);
  }

  getLongTermMemories(
    agentId: string,
    entityId: string,
    opts?: {
      category?: AdvancedLongTermMemoryCategory;
      limit?: number;
    },
  ): Promise<AdvancedLongTermMemory[]> {
    return this.advancedMemoryStore.getLongTermMemories(
      agentId,
      entityId,
      opts,
    );
  }

  updateLongTermMemory(
    id: string,
    agentId: string,
    entityId: string,
    updates: Partial<
      Omit<AdvancedLongTermMemory, "id" | "agentId" | "entityId" | "createdAt">
    >,
  ): Promise<void> {
    return this.advancedMemoryStore.updateLongTermMemory(
      id,
      agentId,
      entityId,
      updates,
    );
  }

  deleteLongTermMemory(
    id: string,
    agentId: string,
    entityId: string,
  ): Promise<void> {
    return this.advancedMemoryStore.deleteLongTermMemory(id, agentId, entityId);
  }

  storeSessionSummary(
    summary: Omit<AdvancedSessionSummary, "id" | "createdAt" | "updatedAt">,
  ): Promise<AdvancedSessionSummary> {
    return this.advancedMemoryStore.storeSessionSummary(summary);
  }

  getCurrentSessionSummary(
    agentId: string,
    roomId: string,
  ): Promise<AdvancedSessionSummary | null> {
    return this.advancedMemoryStore.getCurrentSessionSummary(agentId, roomId);
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
  ): Promise<void> {
    return this.advancedMemoryStore.updateSessionSummary(
      id,
      agentId,
      roomId,
      updates,
    );
  }

  getSessionSummaries(
    agentId: string,
    roomId: string,
    limit = 5,
  ): Promise<AdvancedSessionSummary[]> {
    return this.advancedMemoryStore.getSessionSummaries(agentId, roomId, limit);
  }
}
