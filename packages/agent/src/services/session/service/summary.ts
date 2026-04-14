import {
  type SessionMetadataResolver,
  SessionReadSummaryHelpers,
} from "@/services/session/read-summary";
import type { SessionSummary, SessionUsageSummary } from "@/types";

export class SessionSummaryOperations {
  private readonly helpers: SessionReadSummaryHelpers;

  constructor(
    db: ConstructorParameters<typeof SessionReadSummaryHelpers>[0],
    metadataResolver: SessionMetadataResolver,
  ) {
    this.helpers = new SessionReadSummaryHelpers(db, metadataResolver);
  }

  summary(limit = 10): {
    totalSessions: number;
    recentSessionIds: string[];
  } {
    return this.helpers.summary(limit);
  }

  summarize(sessionId: string, limit = 12): SessionSummary {
    return this.helpers.summarize(sessionId, limit);
  }

  listSessions(limit: number): SessionSummary[] {
    return this.helpers.listSessions(limit);
  }

  listTitled(limit: number): SessionSummary[] {
    return this.helpers.listTitled(limit);
  }

  resolveByTitle(query: string): SessionSummary | undefined {
    return this.helpers.resolveByTitle(query);
  }

  usage(sessionId: string): SessionUsageSummary {
    return this.helpers.usage(sessionId);
  }
}
