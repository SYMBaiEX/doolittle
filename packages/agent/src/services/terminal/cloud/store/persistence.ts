import { existsSync, readFileSync } from "node:fs";
import { writeJsonAtomicSync } from "@elizaos/agent/utils/atomic-json";
import type { CloudStore } from "./types";

export function ensureCloudStoreFile(filePath: string): void {
  if (!existsSync(filePath)) {
    writeCloudStore(filePath, { sessions: [], snapshots: [], artifacts: [] });
  }
}

export function readCloudStore(filePath: string): CloudStore {
  const store = JSON.parse(
    readFileSync(filePath, "utf8"),
  ) as Partial<CloudStore>;
  return {
    sessions: store.sessions ?? [],
    snapshots: store.snapshots ?? [],
    artifacts: store.artifacts ?? [],
  };
}

export function writeCloudStore(filePath: string, store: CloudStore): void {
  writeJsonAtomicSync(filePath, store);
}
