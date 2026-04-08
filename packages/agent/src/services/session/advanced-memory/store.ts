import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import type {
  AdvancedLongTermMemory,
  AdvancedLongTermMemoryCategory,
  AdvancedSessionSummary,
} from "../service";
import {
  deleteLongTermMemory,
  insertLongTermMemory,
  patchLongTermMemory,
  selectLongTermMemories,
  touchLongTermMemories,
} from "./long-term-memory-queries";
import { mapLongTermMemoryRow, mapSessionSummaryRow } from "./mappers";
import {
  insertSessionSummary,
  patchSessionSummary,
  selectCurrentSessionSummary,
  selectSessionSummaries,
} from "./session-summary-queries";

export class SessionAdvancedMemoryStore {
  constructor(private readonly db: Database) {}

  async storeLongTermMemory(
    memory: Omit<
      AdvancedLongTermMemory,
      "id" | "createdAt" | "updatedAt" | "accessCount"
    >,
  ): Promise<AdvancedLongTermMemory> {
    const stored: AdvancedLongTermMemory = {
      ...memory,
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      accessCount: 0,
    };
    insertLongTermMemory(this.db, stored);
    return stored;
  }

  async getLongTermMemories(
    agentId: string,
    entityId: string,
    opts?: {
      category?: AdvancedLongTermMemoryCategory;
      limit?: number;
    },
  ): Promise<AdvancedLongTermMemory[]> {
    const limit = Math.max(1, opts?.limit ?? 10);
    const rows = selectLongTermMemories(
      this.db,
      agentId,
      entityId,
      opts?.category,
      limit,
    );
    const now = new Date().toISOString();
    touchLongTermMemories(
      this.db,
      rows.map((r) => r.id),
      now,
    );
    return rows.map((row) =>
      mapLongTermMemoryRow(row, {
        lastAccessedAt: now,
        accessCount: (row.access_count ?? 0) + 1,
      }),
    );
  }

  async updateLongTermMemory(
    id: string,
    agentId: string,
    entityId: string,
    updates: Partial<
      Omit<AdvancedLongTermMemory, "id" | "agentId" | "entityId" | "createdAt">
    >,
  ): Promise<void> {
    patchLongTermMemory(this.db, id, agentId, entityId, updates);
  }

  async deleteLongTermMemory(
    id: string,
    agentId: string,
    entityId: string,
  ): Promise<void> {
    deleteLongTermMemory(this.db, id, agentId, entityId);
  }

  async storeSessionSummary(
    summary: Omit<AdvancedSessionSummary, "id" | "createdAt" | "updatedAt">,
  ): Promise<AdvancedSessionSummary> {
    const stored: AdvancedSessionSummary = {
      ...summary,
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    insertSessionSummary(this.db, stored);
    return stored;
  }

  async getCurrentSessionSummary(
    agentId: string,
    roomId: string,
  ): Promise<AdvancedSessionSummary | null> {
    const row = selectCurrentSessionSummary(this.db, agentId, roomId);
    return row ? mapSessionSummaryRow(row) : null;
  }

  async updateSessionSummary(
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
    patchSessionSummary(this.db, id, agentId, roomId, updates);
  }

  async getSessionSummaries(
    agentId: string,
    roomId: string,
    limit = 5,
  ): Promise<AdvancedSessionSummary[]> {
    const rows = selectSessionSummaries(
      this.db,
      agentId,
      roomId,
      Math.max(1, limit),
    );
    return rows.map((row) => mapSessionSummaryRow(row));
  }
}
