import type { Database } from "bun:sqlite";
import type { SessionSummary, SessionUsageSummary } from "@/types";
import { findContinuitySessions } from "./continuity";
import { listSessionSummaries, listTitledSessions } from "./listing";
import { buildSessionSummary, loadSummaryStats } from "./query";
import { resolveSessionByTitle } from "./title-resolution";
import type { SessionMetadataResolver } from "./types";
import { resolveSessionUsage } from "./usage";

/** Read-only helpers extracted from SessionService's session summary/usage surface. */
export class SessionReadSummaryHelpers {
  constructor(
    private readonly db: Database,
    private readonly metadataResolver: SessionMetadataResolver,
  ) {}

  summary(limit = 10): {
    totalSessions: number;
    recentSessionIds: string[];
  } {
    const { totalSessions, recentRows } = loadSummaryStats(this.db, limit);
    return {
      totalSessions,
      recentSessionIds: recentRows.map((session) => session.sessionId),
    };
  }

  summarize(sessionId: string, limit = 12): SessionSummary {
    return buildSessionSummary(
      this.db,
      this.metadataResolver,
      sessionId,
      limit,
    );
  }

  listSessions(limit: number): SessionSummary[] {
    return listSessionSummaries(this.db, this.metadataResolver, limit);
  }

  listTitled(limit: number): SessionSummary[] {
    return listTitledSessions(this.db, this.metadataResolver, limit);
  }

  resolveByTitle(query: string): SessionSummary | undefined {
    return resolveSessionByTitle(this.db, this.metadataResolver, query);
  }

  usage(sessionId: string): SessionUsageSummary {
    return resolveSessionUsage(this.db, this.metadataResolver, sessionId);
  }

  continuity(sessionId: string, limit = 20): SessionSummary[] {
    return findContinuitySessions(
      this.db,
      this.metadataResolver,
      sessionId,
      limit,
    );
  }
}

export type { SessionMetadataResolver };
