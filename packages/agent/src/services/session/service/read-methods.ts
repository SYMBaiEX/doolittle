import type { SessionServiceApi } from "./api";
import type { SessionService } from "./index";
import { getSessionServiceState } from "./state";

export const sessionServiceReadMethods: Pick<
  SessionServiceApi,
  | "search"
  | "recent"
  | "recentBySession"
  | "countBySessionRole"
  | "latest"
  | "metadata"
  | "continuity"
  | "continuityKey"
> &
  ThisType<SessionService> = {
  search(query, limit) {
    return getSessionServiceState(this).reads.search(query, limit);
  },

  recent(limit) {
    return getSessionServiceState(this).reads.recent(limit);
  },

  recentBySession(sessionId, limit) {
    return getSessionServiceState(this).reads.recentBySession(sessionId, limit);
  },

  countBySessionRole(sessionId, role) {
    return getSessionServiceState(this).reads.countBySessionRole(
      sessionId,
      role,
    );
  },

  latest(limit) {
    return getSessionServiceState(this).reads.latest(limit);
  },

  metadata(sessionId) {
    return getSessionServiceState(this).reads.metadata(sessionId);
  },

  continuity(sessionId, limit = 20) {
    return getSessionServiceState(this).reads.continuity(sessionId, limit);
  },

  continuityKey(sessionId) {
    return getSessionServiceState(this).reads.continuityKey(sessionId);
  },
};
