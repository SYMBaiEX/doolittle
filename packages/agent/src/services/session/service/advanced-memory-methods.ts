import type { SessionServiceApi } from "./api";
import type { SessionService } from "./index";
import { getSessionServiceState } from "./state";

export const sessionServiceAdvancedMemoryMethods: Pick<
  SessionServiceApi,
  | "storeLongTermMemory"
  | "getLongTermMemories"
  | "updateLongTermMemory"
  | "deleteLongTermMemory"
  | "storeSessionSummary"
  | "getCurrentSessionSummary"
  | "updateSessionSummary"
  | "getSessionSummaries"
> &
  ThisType<SessionService> = {
  storeLongTermMemory(memory) {
    return getSessionServiceState(this).advancedMemory.storeLongTermMemory(
      memory,
    );
  },

  getLongTermMemories(agentId, entityId, opts) {
    return getSessionServiceState(this).advancedMemory.getLongTermMemories(
      agentId,
      entityId,
      opts,
    );
  },

  updateLongTermMemory(id, agentId, entityId, updates) {
    return getSessionServiceState(this).advancedMemory.updateLongTermMemory(
      id,
      agentId,
      entityId,
      updates,
    );
  },

  deleteLongTermMemory(id, agentId, entityId) {
    return getSessionServiceState(this).advancedMemory.deleteLongTermMemory(
      id,
      agentId,
      entityId,
    );
  },

  storeSessionSummary(summary) {
    return getSessionServiceState(this).advancedMemory.storeSessionSummary(
      summary,
    );
  },

  getCurrentSessionSummary(agentId, roomId) {
    return getSessionServiceState(this).advancedMemory.getCurrentSessionSummary(
      agentId,
      roomId,
    );
  },

  updateSessionSummary(id, agentId, roomId, updates) {
    return getSessionServiceState(this).advancedMemory.updateSessionSummary(
      id,
      agentId,
      roomId,
      updates,
    );
  },

  getSessionSummaries(agentId, roomId, limit = 5) {
    return getSessionServiceState(this).advancedMemory.getSessionSummaries(
      agentId,
      roomId,
      limit,
    );
  },
};
