import { Database } from "bun:sqlite";
import { EventEmitter } from "node:events";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  SessionSearchResult,
  SessionSummary,
  SessionUsageSummary,
  StoredMessage,
} from "@/types";
import { SessionAdvancedMemoryStore } from "./advanced-memory";
import {
  type SessionMessageActivityEvent,
  SessionMessageStore,
} from "./messages";
import { SessionMetadataStore } from "./metadata";
import { SessionReadSummaryHelpers } from "./read-summary";
import { migrateSessionDatabase } from "./schema";

export type AdvancedMemoryJsonPrimitive = string | number | boolean | null;
export type AdvancedMemoryJsonValue =
  | AdvancedMemoryJsonPrimitive
  | AdvancedMemoryJsonValue[]
  | {
      [key: string]: AdvancedMemoryJsonValue;
    };

export type AdvancedLongTermMemoryCategory =
  | "episodic"
  | "semantic"
  | "procedural";

export interface AdvancedLongTermMemory {
  id: string;
  agentId: string;
  entityId: string;
  category: AdvancedLongTermMemoryCategory;
  content: string;
  metadata?: Record<string, AdvancedMemoryJsonValue>;
  embedding?: number[];
  confidence?: number;
  source?: string;
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt?: Date;
  accessCount?: number;
  similarity?: number;
}

export interface AdvancedSessionSummary {
  id: string;
  agentId: string;
  roomId: string;
  entityId?: string;
  summary: string;
  messageCount: number;
  lastMessageOffset: number;
  startTime: Date;
  endTime: Date;
  topics?: string[];
  metadata?: Record<string, AdvancedMemoryJsonValue>;
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
}

export class SessionService {
  private readonly db: Database;
  private readonly events = new EventEmitter();
  private readonly messageStore: SessionMessageStore;
  private readonly metadataStore: SessionMetadataStore;
  private readonly readSummaryHelpers: SessionReadSummaryHelpers;
  private readonly advancedMemoryStore: SessionAdvancedMemoryStore;

  constructor(baseDir: string) {
    const dbPath = join(baseDir, "state.db");
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath, { create: true });
    this.readSummaryHelpers = new SessionReadSummaryHelpers(this.db, {
      metadata: this.metadata.bind(this),
      continuityKeyFor: this.continuityKeyFor.bind(this),
    });
    this.messageStore = new SessionMessageStore(this.db, this.events);
    this.metadataStore = new SessionMetadataStore(this.db, {
      summarize: this.summarize.bind(this),
      continuityKeyFor: this.continuityKeyFor.bind(this),
    });
    this.advancedMemoryStore = new SessionAdvancedMemoryStore(this.db);
    this.migrate();
  }

  storeMessage(message: StoredMessage): void {
    this.messageStore.storeMessage(message);
  }

  onActivity(
    listener: (event: SessionMessageActivityEvent) => void,
  ): () => void {
    return this.messageStore.onActivity(listener);
  }

  search(query: string, limit: number): SessionSearchResult[] {
    return this.messageStore.search(query, limit);
  }

  recent(limit: number): SessionSearchResult[] {
    return this.messageStore.recent(limit);
  }

  recentBySession(sessionId: string, limit: number): SessionSearchResult[] {
    return this.messageStore.recentBySession(sessionId, limit);
  }

  countBySessionRole(sessionId: string, role?: StoredMessage["role"]): number {
    return this.messageStore.countBySessionRole(sessionId, role);
  }

  latest(limit: number): SessionSearchResult[] {
    return this.messageStore.latest(limit);
  }

  summary(limit = 10): {
    totalSessions: number;
    recentSessionIds: string[];
  } {
    return this.readSummaryHelpers.summary(limit);
  }

  summarize(sessionId: string, limit = 12): SessionSummary {
    return this.readSummaryHelpers.summarize(sessionId, limit);
  }

  listSessions(limit: number): SessionSummary[] {
    return this.readSummaryHelpers.listSessions(limit);
  }

  listTitled(limit: number): SessionSummary[] {
    return this.readSummaryHelpers.listTitled(limit);
  }

  resolveByTitle(query: string): SessionSummary | undefined {
    return this.readSummaryHelpers.resolveByTitle(query);
  }

  usage(sessionId: string): SessionUsageSummary {
    return this.readSummaryHelpers.usage(sessionId);
  }

  rename(sessionId: string, title: string): SessionSummary {
    return this.metadataStore.rename(sessionId, title);
  }

  metadata(
    sessionId: string,
  ): { title?: string; continuityKey?: string } | undefined {
    return this.metadataStore.metadata(sessionId);
  }

  continuity(sessionId: string, limit = 20): SessionSummary[] {
    return this.metadataStore.continuity(sessionId, limit);
  }

  continuityKey(sessionId: string): string {
    return this.metadataStore.continuityKey(sessionId);
  }

  async storeLongTermMemory(
    memory: Omit<
      AdvancedLongTermMemory,
      "id" | "createdAt" | "updatedAt" | "accessCount"
    >,
  ): Promise<AdvancedLongTermMemory> {
    return this.advancedMemoryStore.storeLongTermMemory(memory);
  }

  async getLongTermMemories(
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

  async updateLongTermMemory(
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

  async deleteLongTermMemory(
    id: string,
    agentId: string,
    entityId: string,
  ): Promise<void> {
    return this.advancedMemoryStore.deleteLongTermMemory(id, agentId, entityId);
  }

  async storeSessionSummary(
    summary: Omit<AdvancedSessionSummary, "id" | "createdAt" | "updatedAt">,
  ): Promise<AdvancedSessionSummary> {
    return this.advancedMemoryStore.storeSessionSummary(summary);
  }

  async getCurrentSessionSummary(
    agentId: string,
    roomId: string,
  ): Promise<AdvancedSessionSummary | null> {
    return this.advancedMemoryStore.getCurrentSessionSummary(agentId, roomId);
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
    return this.advancedMemoryStore.updateSessionSummary(
      id,
      agentId,
      roomId,
      updates,
    );
  }

  async getSessionSummaries(
    agentId: string,
    roomId: string,
    limit = 5,
  ): Promise<AdvancedSessionSummary[]> {
    return this.advancedMemoryStore.getSessionSummaries(agentId, roomId, limit);
  }

  private continuityKeyFor(sessionId: string): string {
    return sessionId.split(":").slice(0, 2).join(":") || sessionId;
  }

  private migrate(): void {
    migrateSessionDatabase(this.db);
  }
}
