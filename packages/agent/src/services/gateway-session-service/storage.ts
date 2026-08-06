import { existsSync, readFileSync } from "node:fs";
import { writeJsonAtomicSync } from "@elizaos/agent/utils/atomic-json";
import { normalizeSessionRoute, type SessionRouteStore } from "./routes";

export function readSessionRouteStore(filePath: string): SessionRouteStore {
  const raw = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as SessionRouteStore;
  return {
    sessions: (parsed.sessions ?? []).map(normalizeSessionRoute),
  };
}

export function writeSessionRouteStore(
  filePath: string,
  store: SessionRouteStore,
  options?: { ifMissing?: boolean },
): void {
  if (options?.ifMissing && existsSync(filePath)) {
    return;
  }

  writeJsonAtomicSync(filePath, store);
}
