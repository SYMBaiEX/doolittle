import type { SessionServiceApi } from "./api";
import type { SessionService } from "./index";
import { getSessionServiceState } from "./state";

export const sessionServiceSummaryMethods: Pick<
  SessionServiceApi,
  | "summary"
  | "summarize"
  | "listSessions"
  | "listTitled"
  | "resolveByTitle"
  | "usage"
> &
  ThisType<SessionService> = {
  summary(limit = 10) {
    return getSessionServiceState(this).summaries.summary(limit);
  },

  summarize(sessionId, limit = 12) {
    return getSessionServiceState(this).summaries.summarize(sessionId, limit);
  },

  listSessions(limit) {
    return getSessionServiceState(this).summaries.listSessions(limit);
  },

  listTitled(limit) {
    return getSessionServiceState(this).summaries.listTitled(limit);
  },

  resolveByTitle(query) {
    return getSessionServiceState(this).summaries.resolveByTitle(query);
  },

  usage(sessionId) {
    return getSessionServiceState(this).summaries.usage(sessionId);
  },
};
