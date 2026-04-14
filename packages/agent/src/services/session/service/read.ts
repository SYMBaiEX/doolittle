import type {
  SessionSearchResult,
  SessionSummary,
  StoredMessage,
} from "@/types";
import type { SessionMessageStore } from "../messages";
import type { SessionMetadataStore, SessionMetadataValue } from "../metadata";

export class SessionReadOperations {
  constructor(
    private readonly messageStore: SessionMessageStore,
    private readonly metadataStore: SessionMetadataStore,
  ) {}

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

  metadata(sessionId: string): SessionMetadataValue | undefined {
    return this.metadataStore.metadata(sessionId);
  }

  continuity(sessionId: string, limit = 20): SessionSummary[] {
    return this.metadataStore.continuity(sessionId, limit);
  }

  continuityKey(sessionId: string): string {
    return this.metadataStore.continuityKey(sessionId);
  }
}
