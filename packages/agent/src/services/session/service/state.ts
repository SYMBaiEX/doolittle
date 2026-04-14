import type { SessionAdvancedMemoryOperations } from "./advanced-memory";
import type { SessionService } from "./index";
import type { SessionReadOperations } from "./read";
import type { SessionSummaryOperations } from "./summary";
import type { SessionWriteOperations } from "./write";

export interface SessionServiceState {
  writes: SessionWriteOperations;
  reads: SessionReadOperations;
  summaries: SessionSummaryOperations;
  advancedMemory: SessionAdvancedMemoryOperations;
}

const sessionServiceState = new WeakMap<SessionService, SessionServiceState>();

export function setSessionServiceState(
  service: SessionService,
  state: SessionServiceState,
): void {
  sessionServiceState.set(service, state);
}

export function getSessionServiceState(
  service: SessionService,
): SessionServiceState {
  const state = sessionServiceState.get(service);
  if (!state) {
    throw new Error("Session service state is unavailable");
  }
  return state;
}
