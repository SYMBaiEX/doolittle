import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type {
  KnowledgeGrant,
  SharedKnowledgeRecord,
} from "@doolittle/contracts/bots";
import { writeJsonAtomicSync } from "@elizaos/agent/utils/atomic-json";

const ID = /^[A-Za-z0-9:_-]{1,128}$/u;
const UUID = /^[0-9a-f-]{36}$/iu;
const MAX_BYTES = 4_000_000;

function identifier(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export type { KnowledgeGrant } from "@doolittle/contracts/bots";

interface StoredKnowledge {
  version: 1 | 2;
  revision: number;
  records: SharedKnowledgeRecord[];
  grants: KnowledgeGrant[];
}

function parse(path: string): StoredKnowledge | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  if (Buffer.byteLength(raw) > MAX_BYTES)
    throw new Error("Knowledge ledger is too large.");
  const value = JSON.parse(raw) as Partial<StoredKnowledge>;
  if (
    (value.version !== 1 && value.version !== 2) ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision ?? -1) < 0 ||
    !Array.isArray(value.records) ||
    !Array.isArray(value.grants) ||
    value.records.length > 5_000 ||
    value.grants.length > 20_000 ||
    value.records.some(
      (row) =>
        !row ||
        !uuid(row.id) ||
        !uuid(row.documentId) ||
        row.version !== 1 ||
        !["project", ...(value.version === 2 ? ["team"] : [])].includes(
          row.scope?.kind,
        ) ||
        !identifier(row.scope.id) ||
        (row.scope.kind === "team" && !uuid(row.scope.id)) ||
        !identifier(row.source?.botId) ||
        !identifier(row.source?.agentId) ||
        !identifier(row.source?.sessionId) ||
        !identifier(row.source?.runId) ||
        (row.scope.kind === "project" &&
          row.source?.projectId !== row.scope.id) ||
        (row.source?.projectId !== undefined &&
          !identifier(row.source.projectId)) ||
        !identifier(row.source?.messageId) ||
        !Array.isArray(row.source?.links) ||
        row.source.links.length !== 0 ||
        typeof row.title !== "string" ||
        !row.title ||
        row.title.length > 300 ||
        row.promotedBy !== "desktop-owner-consent" ||
        !timestamp(row.createdAt) ||
        !timestamp(row.updatedAt) ||
        (row.revokedAt !== undefined && !timestamp(row.revokedAt)),
    ) ||
    value.grants.some(
      (row) =>
        !row ||
        !uuid(row.knowledgeId) ||
        !identifier(row.botId) ||
        !timestamp(row.grantedAt) ||
        (row.revokedAt !== undefined && !timestamp(row.revokedAt)),
    ) ||
    new Set(value.records.map((row) => row.id)).size !== value.records.length ||
    new Set(value.grants.map((row) => `${row.knowledgeId}:${row.botId}`))
      .size !== value.grants.length ||
    value.grants.some(
      (row) => !value.records?.some((record) => record.id === row.knowledgeId),
    )
  ) {
    throw new Error("Knowledge ledger is invalid.");
  }
  return value as StoredKnowledge;
}

/** Provenance and grants only. Document content stays in the SDK worker DB. */
export class BotKnowledgeLedger {
  private readonly path: string;
  private readonly backupPath: string;
  private stored: StoredKnowledge;
  private failed = false;

  constructor(dataDir: string) {
    this.path = resolve(dataDir, "bots", "knowledge.json");
    this.backupPath = resolve(dataDir, "bots", "knowledge.backup.json");
    let primary: StoredKnowledge | null = null;
    let backup: StoredKnowledge | null = null;
    let failure: unknown;
    try {
      primary = parse(this.path);
    } catch (error) {
      failure = error;
    }
    try {
      backup = parse(this.backupPath);
    } catch (error) {
      failure ??= error;
    }
    if (failure && !primary && !backup)
      throw new Error("Both knowledge ledger copies are unavailable.", {
        cause: failure,
      });
    if (
      primary &&
      backup &&
      primary.revision === backup.revision &&
      JSON.stringify(primary) !== JSON.stringify(backup)
    ) {
      throw new Error("Knowledge ledger copies disagree.");
    }
    this.stored =
      primary && (!backup || primary.revision >= backup.revision)
        ? primary
        : (backup ?? { version: 2, revision: 0, records: [], grants: [] });
    if (this.stored.version === 1) {
      const migrationBackup = resolve(
        dataDir,
        "bots",
        "knowledge.v1.backup.json",
      );
      // Preserve the original schema once; restart never overwrites the rollback copy.
      if (!existsSync(migrationBackup)) {
        mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
        writeJsonAtomicSync(migrationBackup, this.stored, {
          trailingNewline: true,
        });
        chmodSync(migrationBackup, 0o600);
      }
      this.save({ ...this.stored, version: 2 });
    }
  }

  private save(next: StoredKnowledge): void {
    if (this.failed) throw new Error("Knowledge ledger requires recovery.");
    const value = { ...next, revision: this.stored.revision + 1 };
    if (Buffer.byteLength(JSON.stringify(value)) > MAX_BYTES)
      throw new Error("Knowledge ledger is full.");
    try {
      mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
      writeJsonAtomicSync(this.path, value, { trailingNewline: true });
      chmodSync(this.path, 0o600);
      writeJsonAtomicSync(this.backupPath, value, { trailingNewline: true });
      chmodSync(this.backupPath, 0o600);
      this.stored = value;
    } catch (error) {
      this.failed = true;
      throw error;
    }
  }

  get(id: string): SharedKnowledgeRecord | null {
    if (this.failed) throw new Error("Knowledge ledger requires recovery.");
    const value = this.stored.records.find((row) => row.id === id);
    if (!value) return null;
    const copy = structuredClone(value);
    if (
      this.stored.records.filter((row) => row.documentId === value.documentId)
        .length > 1
    )
      copy.integrity = {
        status: "ambiguous-document",
        message:
          "Promoted document identity is ambiguous. Revoke and re-promote the exact source message; the original provenance is preserved.",
      };
    return copy;
  }

  list(): SharedKnowledgeRecord[] {
    return this.stored.records.map(
      (row) => this.get(row.id) as SharedKnowledgeRecord,
    );
  }

  listGrants(): KnowledgeGrant[] {
    return this.stored.grants.map((row) => structuredClone(row));
  }

  promote(record: SharedKnowledgeRecord): void {
    if (this.get(record.id)) throw new Error("Knowledge ID already exists.");
    if (this.stored.records.some((row) => row.documentId === record.documentId))
      throw new Error(
        "SDK document identity is already attached to another promotion. Re-promote the exact source with a fresh document identity.",
      );
    this.save({
      ...this.stored,
      records: [...this.stored.records, structuredClone(record)],
    });
  }

  grant(knowledgeId: string, botId: string): void {
    const record = this.get(knowledgeId);
    if (!record || record.revokedAt)
      throw new Error("Knowledge is unavailable.");
    if (record.integrity) throw new Error(record.integrity.message);
    const now = new Date().toISOString();
    const existing = this.stored.grants.find(
      (row) => row.knowledgeId === knowledgeId && row.botId === botId,
    );
    const grants = existing
      ? this.stored.grants.map((row) =>
          row === existing
            ? { ...row, revokedAt: undefined, grantedAt: now }
            : row,
        )
      : [...this.stored.grants, { knowledgeId, botId, grantedAt: now }];
    this.save({ ...this.stored, grants });
  }

  granted(knowledgeId: string, botId: string): boolean {
    return Boolean(
      this.get(knowledgeId) &&
        !this.get(knowledgeId)?.revokedAt &&
        !this.get(knowledgeId)?.integrity &&
        this.stored.grants.find(
          (row) =>
            row.knowledgeId === knowledgeId &&
            row.botId === botId &&
            !row.revokedAt,
        ),
    );
  }

  revoke(knowledgeId: string, botId?: string): void {
    const record = this.get(knowledgeId);
    if (!record) throw new Error("Knowledge not found.");
    const at = new Date().toISOString();
    if (botId) {
      const grant = this.stored.grants.find(
        (row) => row.knowledgeId === knowledgeId && row.botId === botId,
      );
      if (!grant) throw new Error("Knowledge grant not found.");
      this.save({
        ...this.stored,
        grants: this.stored.grants.map((row) =>
          row === grant ? { ...row, revokedAt: at } : row,
        ),
      });
    } else {
      this.save({
        ...this.stored,
        records: this.stored.records.map((row) =>
          row.id === knowledgeId ? { ...row, revokedAt: at } : row,
        ),
      });
    }
  }
}
