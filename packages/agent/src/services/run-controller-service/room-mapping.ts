import type { RunControllerStore } from "@/services/run-controller/store";
import type { RunSnapshot } from "@/services/run-controller/types";

export function getRunByRoomId(
  store: RunControllerStore,
  roomId: string,
): RunSnapshot | undefined {
  return store.getByRoom(roomId);
}

export function withSessionForRoom(
  store: RunControllerStore,
  roomId: string,
  apply: (sessionId: string) => void,
): void {
  const sessionId = store.getSessionByRoom(roomId);
  if (!sessionId) {
    return;
  }
  apply(sessionId);
}
