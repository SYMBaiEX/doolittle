import { existsSync, mkdirSync } from "node:fs";
import type { StoredFormRecord } from "@doolittle/contracts";
import {
  readJsonFileSync,
  writeJsonAtomicSync,
} from "@elizaos/agent/utils/atomic-json";
import { nowIso } from "../record-utils";
import { normalizeMetadata } from "./normalization";
import type { FormsStore } from "./types";

export function ensureStoreInitialized(
  rootDir: string,
  storePath: string,
): void {
  mkdirSync(rootDir, { recursive: true });
  if (!existsSync(storePath)) {
    writeStore(storePath, { forms: [] });
  }
}

export function readStore(storePath: string): FormsStore {
  const parsed = readJsonFileSync<{
    forms?: Array<Partial<StoredFormRecord>>;
  }>(storePath);
  return {
    forms: Array.isArray(parsed?.forms)
      ? parsed.forms
          .filter(
            (
              entry,
            ): entry is Partial<StoredFormRecord> &
              Pick<StoredFormRecord, "id" | "templateId"> =>
              Boolean(entry.id && entry.templateId),
          )
          .map((entry) => ({
            id: entry.id,
            templateId: entry.templateId,
            status:
              entry.status === "completed" || entry.status === "cancelled"
                ? entry.status
                : "active",
            metadata: normalizeMetadata(entry.metadata),
            createdAt: entry.createdAt ?? nowIso(),
            updatedAt: entry.updatedAt ?? entry.createdAt ?? nowIso(),
          }))
      : [],
  };
}

export function writeStore(storePath: string, store: FormsStore): void {
  writeJsonAtomicSync(storePath, store);
}
