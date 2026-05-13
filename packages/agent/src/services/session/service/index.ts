import { sessionServiceAdvancedMemoryMethods } from "./advanced-memory-methods";
import type { SessionServiceApi } from "./api";
import { createSessionServiceState } from "./composition";
import { sessionServiceReadMethods } from "./read-methods";
import { setSessionServiceState } from "./state";
import { sessionServiceSummaryMethods } from "./summary-methods";
import { sessionServiceWriteMethods } from "./write-methods";

export type {
  AdvancedLongTermMemory,
  AdvancedLongTermMemoryCategory,
  AdvancedMemoryJsonPrimitive,
  AdvancedMemoryJsonValue,
  AdvancedSessionSummary,
} from "./types";

export class SessionService {
  declare storeMessage: SessionServiceApi["storeMessage"];
  declare replaceSessionMessages: SessionServiceApi["replaceSessionMessages"];
  declare deleteLatestExchange: SessionServiceApi["deleteLatestExchange"];
  declare onActivity: SessionServiceApi["onActivity"];
  declare search: SessionServiceApi["search"];
  declare recent: SessionServiceApi["recent"];
  declare recentBySession: SessionServiceApi["recentBySession"];
  declare messagesBySession: SessionServiceApi["messagesBySession"];
  declare countBySessionRole: SessionServiceApi["countBySessionRole"];
  declare latest: SessionServiceApi["latest"];
  declare summary: SessionServiceApi["summary"];
  declare summarize: SessionServiceApi["summarize"];
  declare listSessions: SessionServiceApi["listSessions"];
  declare listTitled: SessionServiceApi["listTitled"];
  declare resolveByTitle: SessionServiceApi["resolveByTitle"];
  declare usage: SessionServiceApi["usage"];
  declare rename: SessionServiceApi["rename"];
  declare metadata: SessionServiceApi["metadata"];
  declare continuity: SessionServiceApi["continuity"];
  declare continuityKey: SessionServiceApi["continuityKey"];
  declare storeLongTermMemory: SessionServiceApi["storeLongTermMemory"];
  declare getLongTermMemories: SessionServiceApi["getLongTermMemories"];
  declare updateLongTermMemory: SessionServiceApi["updateLongTermMemory"];
  declare deleteLongTermMemory: SessionServiceApi["deleteLongTermMemory"];
  declare storeSessionSummary: SessionServiceApi["storeSessionSummary"];
  declare getCurrentSessionSummary: SessionServiceApi["getCurrentSessionSummary"];
  declare updateSessionSummary: SessionServiceApi["updateSessionSummary"];
  declare getSessionSummaries: SessionServiceApi["getSessionSummaries"];

  constructor(baseDir: string) {
    setSessionServiceState(this, createSessionServiceState(baseDir));
  }
}

Object.assign(
  SessionService.prototype,
  sessionServiceWriteMethods,
  sessionServiceReadMethods,
  sessionServiceSummaryMethods,
  sessionServiceAdvancedMemoryMethods,
);
