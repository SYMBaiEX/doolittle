import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type {
  BotConsultationResult,
  BotPermissions,
  BotRunOwner,
} from "@doolittle/contracts/bots";
import { readRegularFileSync } from "@doolittle/storage";
import { readLedgerCopies, writeLedgerCopies } from "./revisioned-ledger";

const ID = /^[A-Za-z0-9:_-]{1,128}$/u;
const MAX_LEDGER_BYTES = 8_000_000;
const MAX_RECORDS = 10_000;

export interface BotConsultationRecord {
  dispatchId: string;
  rootRunId: string;
  parentDispatchId?: string;
  ancestry: string[];
  depth: number;
  origin: BotRunOwner;
  targetBotId: string;
  targetSessionId: string;
  targetRunId: string;
  /** Exact one-shot root; legacy records without it cannot authorize execution. */
  workspacePath?: string;
  knowledgeIds?: string[];
  permissions: BotPermissions;
  deadline: string;
  status:
    | "prepared"
    | "accepted"
    | "complete"
    | "cancelled"
    | "error"
    | "timeout";
  createdAt: string;
  updatedAt: string;
  result?: BotConsultationResult;
}

interface StoredConsultations {
  version: 1;
  revision: number;
  records: BotConsultationRecord[];
}

function parse(path: string): StoredConsultations | null {
  if (!existsSync(path)) return null;
  const raw = readRegularFileSync(path, MAX_LEDGER_BYTES).toString("utf8");
  const value = JSON.parse(raw) as Partial<StoredConsultations>;
  if (
    value.version !== 1 ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision ?? -1) < 0 ||
    !Array.isArray(value.records) ||
    value.records.length > MAX_RECORDS ||
    value.records.some(
      (record) =>
        !record ||
        !ID.test(record.dispatchId) ||
        !ID.test(record.rootRunId) ||
        !ID.test(record.targetRunId) ||
        !ID.test(record.targetSessionId) ||
        !ID.test(record.targetBotId) ||
        (record.workspacePath !== undefined &&
          (typeof record.workspacePath !== "string" ||
            !isAbsolute(record.workspacePath) ||
            resolve(record.workspacePath) !== record.workspacePath)) ||
        !ID.test(record.origin?.runId) ||
        !Array.isArray(record.ancestry) ||
        !record.ancestry.every((id) => typeof id === "string" && ID.test(id)) ||
        !Number.isSafeInteger(record.depth) ||
        record.depth < 1 ||
        record.depth > 2 ||
        ![
          "prepared",
          "accepted",
          "complete",
          "cancelled",
          "error",
          "timeout",
        ].includes(record.status),
    ) ||
    new Set(value.records.map((record) => record.dispatchId)).size !==
      value.records.length ||
    new Set(value.records.map((record) => record.targetRunId)).size !==
      value.records.length
  ) {
    throw new Error("The consultation ledger is invalid.");
  }
  return value as StoredConsultations;
}

/** Durable intent before dispatch; uncertain submissions are never replayed. */
export class BotConsultationLedger {
  private readonly path: string;
  private readonly backupPath: string;
  private stored: StoredConsultations;
  private failed = false;

  constructor(dataDir: string) {
    this.path = resolve(dataDir, "bots", "consultations.json");
    this.backupPath = resolve(dataDir, "bots", "consultations.backup.json");
    this.stored = readLedgerCopies(
      this.path,
      this.backupPath,
      parse,
      "consultation ledger",
    ) ?? { version: 1, revision: 0, records: [] };
  }

  private save(): void {
    if (this.failed)
      throw new Error(
        "Consultation ledger needs recovery before another write.",
      );
    const next = { ...this.stored, revision: this.stored.revision + 1 };
    if (
      next.records.length > MAX_RECORDS ||
      Buffer.byteLength(JSON.stringify(next, null, 2)) + 1 > MAX_LEDGER_BYTES
    ) {
      throw new Error("The consultation ledger is full.");
    }
    try {
      writeLedgerCopies(this.path, this.backupPath, next);
      this.stored = next;
    } catch (error) {
      this.failed = true;
      throw error;
    }
  }

  get(dispatchId: string): BotConsultationRecord | undefined {
    const record = this.stored.records.find(
      (entry) => entry.dispatchId === dispatchId,
    );
    return record ? structuredClone(record) : undefined;
  }

  byTargetRun(runId: string): BotConsultationRecord | undefined {
    const record = this.stored.records.find(
      (entry) => entry.targetRunId === runId,
    );
    return record ? structuredClone(record) : undefined;
  }

  countRoot(rootRunId: string): number {
    return this.stored.records.filter((entry) => entry.rootRunId === rootRunId)
      .length;
  }

  forRoot(rootRunId: string): BotConsultationRecord[] {
    if (!ID.test(rootRunId)) throw new Error("Run ID is invalid.");
    return this.stored.records
      .filter((entry) => entry.rootRunId === rootRunId)
      .map((entry) => structuredClone(entry));
  }

  activeForBot(botId: string): BotConsultationRecord[] {
    if (!ID.test(botId)) throw new Error("Bot ID is invalid.");
    return this.stored.records
      .filter(
        (entry) =>
          (entry.origin.botId === botId || entry.targetBotId === botId) &&
          !["complete", "cancelled", "error", "timeout"].includes(entry.status),
      )
      .map((entry) => structuredClone(entry));
  }

  prepare(record: BotConsultationRecord): BotConsultationRecord {
    if (this.get(record.dispatchId) || this.byTargetRun(record.targetRunId)) {
      throw new Error("Consultation identity already exists.");
    }
    // Reserve synchronously after async broker checks; parallel dispatches
    // cannot all spend the same remaining root fan-out slot.
    if (this.countRoot(record.rootRunId) >= 3)
      throw new Error("This run has reached its consultation limit.");
    this.stored.records.push(structuredClone(record));
    try {
      this.save();
    } catch (error) {
      this.stored.records.pop();
      throw error;
    }
    return structuredClone(record);
  }

  update(
    dispatchId: string,
    status: BotConsultationRecord["status"],
    result?: BotConsultationResult,
  ): BotConsultationRecord {
    const index = this.stored.records.findIndex(
      (entry) => entry.dispatchId === dispatchId,
    );
    if (index < 0) throw new Error("Consultation not found.");
    const current = this.stored.records[index];
    if (
      !current ||
      ["complete", "cancelled", "error", "timeout"].includes(current.status)
    ) {
      throw new Error("Consultation is already terminal.");
    }
    const next: BotConsultationRecord = {
      ...current,
      status,
      updatedAt: new Date().toISOString(),
      ...(result ? { result } : {}),
    };
    this.stored.records[index] = next;
    try {
      this.save();
    } catch (error) {
      this.stored.records[index] = current;
      throw error;
    }
    return structuredClone(next);
  }
}
