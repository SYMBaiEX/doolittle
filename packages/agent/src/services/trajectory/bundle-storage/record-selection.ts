import type {
  TrajectoryExportOptions,
  TrajectoryRecord,
} from "../../../types/trajectory";
import type { TrajectoryBundleStorageHost } from "./types";

export function collectTrajectoryRecords(
  host: TrajectoryBundleStorageHost,
  options: TrajectoryExportOptions,
): TrajectoryRecord[] {
  const messages = host.sessions.recent(
    options.limit ?? 100,
  ) as TrajectoryRecord[];
  return messages.filter((message) => {
    if (options.sessionId && message.sessionId !== options.sessionId) {
      return false;
    }
    if (options.role && message.role !== options.role) {
      return false;
    }
    return true;
  });
}
