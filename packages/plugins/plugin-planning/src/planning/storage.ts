import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { StoredPlanRecord } from "@doolittle/contracts";
import {
  normalizeMetadata,
  normalizeStatus,
  normalizeSteps,
} from "./normalization";
import type { PlanningStore } from "./types";
import { nowIso } from "./utils";

const FILE_ENCODING = "utf8";

export function ensureStoreInitialized(
  rootDir: string,
  storePath: string,
): void {
  mkdirSync(rootDir, { recursive: true });
  if (!existsSync(storePath)) {
    writeStore(storePath, { plans: [] });
  }
}

export function readStore(storePath: string): PlanningStore {
  try {
    const parsed = JSON.parse(readFileSync(storePath, FILE_ENCODING)) as {
      plans?: Array<Partial<StoredPlanRecord>>;
    };
    return {
      plans: Array.isArray(parsed.plans)
        ? parsed.plans
            .filter(
              (
                entry,
              ): entry is Partial<StoredPlanRecord> &
                Pick<StoredPlanRecord, "id" | "title" | "objective"> =>
                Boolean(entry.id && entry.title && entry.objective),
            )
            .map((entry) => ({
              id: entry.id,
              title: entry.title,
              objective: entry.objective,
              status: normalizeStatus(entry.status),
              createdAt: entry.createdAt ?? nowIso(),
              updatedAt: entry.updatedAt ?? entry.createdAt ?? nowIso(),
              taskId:
                typeof entry.taskId === "string" ? entry.taskId : undefined,
              workflowId:
                typeof entry.workflowId === "string"
                  ? entry.workflowId
                  : undefined,
              metadata: normalizeMetadata(entry.metadata),
              steps: normalizeSteps(entry.steps),
            }))
        : [],
    };
  } catch {
    return { plans: [] };
  }
}

export function writeStore(storePath: string, store: PlanningStore): void {
  writeFileSync(storePath, JSON.stringify(store, null, 2), FILE_ENCODING);
}
