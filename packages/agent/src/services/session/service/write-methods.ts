import type { SessionServiceApi } from "./api";
import type { SessionService } from "./index";
import { getSessionServiceState } from "./state";

export const sessionServiceWriteMethods: Pick<
  SessionServiceApi,
  | "storeMessage"
  | "recordRunTerminalBoundary"
  | "replaceSessionMessages"
  | "deleteLatestExchange"
  | "forkSession"
  | "onActivity"
  | "rename"
  | "claimSessionTitle"
> &
  ThisType<SessionService> = {
  storeMessage(message, options) {
    getSessionServiceState(this).writes.storeMessage(message, options);
  },

  recordRunTerminalBoundary(runId, sessionId, status) {
    getSessionServiceState(this).writes.recordRunTerminalBoundary(
      runId,
      sessionId,
      status,
    );
  },

  replaceSessionMessages(sessionId, messages) {
    getSessionServiceState(this).writes.replaceSessionMessages(
      sessionId,
      messages,
    );
  },

  deleteLatestExchange(sessionId, options) {
    return getSessionServiceState(this).writes.deleteLatestExchange(
      sessionId,
      options,
    );
  },

  forkSession(input) {
    return getSessionServiceState(this).writes.forkSession(input);
  },

  onActivity(listener) {
    return getSessionServiceState(this).writes.onActivity(listener);
  },

  rename(sessionId, title) {
    return getSessionServiceState(this).writes.rename(sessionId, title);
  },

  claimSessionTitle(sessionId, title) {
    return getSessionServiceState(this).writes.claimSessionTitle(
      sessionId,
      title,
    );
  },
};
