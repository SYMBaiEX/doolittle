import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { StoredFormRecord } from "@doolittle/contracts";
import { normalizeMetadata } from "./normalization";
import type { FormsStore } from "./types";
import { nowIso } from "./utils";

const FILE_ENCODING = "utf8";

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
  try {
    const parsed = JSON.parse(readFileSync(storePath, FILE_ENCODING)) as {
      forms?: Array<Partial<StoredFormRecord>>;
    };
    return {
      forms: Array.isArray(parsed.forms)
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
  } catch {
    return { forms: [] };
  }
}

export function writeStore(storePath: string, store: FormsStore): void {
  writeFileSync(storePath, JSON.stringify(store, null, 2), FILE_ENCODING);
}
