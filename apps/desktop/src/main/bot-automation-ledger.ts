import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { BotPermissions } from "@doolittle/contracts/bots";
import { writeJsonAtomicSync } from "@elizaos/agent/utils/atomic-json";

export interface AutomationTargetApproval {
  id: string;
  jobId: string;
  targetBotId: string;
  targetRevision: string;
  definitionDigest: string;
  permissions: BotPermissions;
  createdAt: string;
}
export interface AutomationTargetFire {
  fireId: string;
  fireKeyDigest: string;
  jobId: string;
  approvalId: string;
  targetBotId: string;
  sessionId: string;
  runId: string;
  status: "prepared" | "accepted" | "complete" | "cancelled" | "error";
  createdAt: string;
  updatedAt: string;
}
interface Stored {
  version: 1;
  revision: number;
  approvals: AutomationTargetApproval[];
  fires: AutomationTargetFire[];
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const HASH = /^[0-9a-f]{64}$/u;
function validId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
function date(value: unknown): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function parse(path: string): Stored | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  if (Buffer.byteLength(raw) > 8_000_000)
    throw new Error("Automation dispatch ledger is full.");
  const value = JSON.parse(raw) as Stored;
  if (
    value?.version !== 1 ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    !Array.isArray(value.approvals) ||
    !Array.isArray(value.fires) ||
    value.approvals.length > 2_000 ||
    value.fires.length > 5_000 ||
    value.approvals.some(
      (row) =>
        !row ||
        !validId(row.id) ||
        !validId(row.jobId) ||
        !validId(row.targetBotId) ||
        !date(row.targetRevision) ||
        !date(row.createdAt) ||
        typeof row.definitionDigest !== "string" ||
        !HASH.test(row.definitionDigest) ||
        !row.permissions ||
        ![
          row.permissions.connectionIds,
          row.permissions.workspacePaths,
          row.permissions.toolIds,
        ].every(
          (ids) =>
            Array.isArray(ids) &&
            ids.length < 200 &&
            ids.every((id) => typeof id === "string" && id.length <= 4_096),
        ) ||
        typeof row.permissions.allowMutation !== "boolean" ||
        typeof row.permissions.allowDelegation !== "boolean",
    ) ||
    value.fires.some(
      (row) =>
        !row ||
        !validId(row.fireId) ||
        !validId(row.jobId) ||
        !validId(row.approvalId) ||
        !validId(row.targetBotId) ||
        typeof row.fireKeyDigest !== "string" ||
        !HASH.test(row.fireKeyDigest) ||
        row.sessionId !== `automation:${row.jobId}:${row.fireId}` ||
        row.runId !== `automation:${row.fireId}` ||
        !["prepared", "accepted", "complete", "cancelled", "error"].includes(
          row.status,
        ) ||
        !date(row.createdAt) ||
        !date(row.updatedAt) ||
        !value.approvals.some(
          (approval) =>
            approval.id === row.approvalId &&
            approval.jobId === row.jobId &&
            approval.targetBotId === row.targetBotId,
        ),
    ) ||
    new Set(value.approvals.map((row) => row.id)).size !==
      value.approvals.length ||
    new Set(value.fires.map((row) => row.fireId)).size !== value.fires.length ||
    new Set(value.fires.map((row) => `${row.jobId}:${row.fireKeyDigest}`))
      .size !== value.fires.length
  )
    throw new Error("Automation dispatch ledger is invalid.");
  return value;
}

/** Bookkeeping only. The official SDK remains the sole schedule owner. */
export class BotAutomationLedger {
  private readonly path: string;
  private readonly backup: string;
  private stored: Stored;
  private failed = false;
  constructor(dataDir: string) {
    this.path = resolve(dataDir, "bots", "automation-dispatches.json");
    this.backup = resolve(dataDir, "bots", "automation-dispatches.backup.json");
    let primary: Stored | null = null;
    let secondary: Stored | null = null;
    let failure: unknown;
    try {
      primary = parse(this.path);
    } catch (error) {
      failure = error;
    }
    try {
      secondary = parse(this.backup);
    } catch (error) {
      failure ??= error;
    }
    if (failure && !primary && !secondary)
      throw new Error(
        "Both automation dispatch ledger copies are unavailable.",
        { cause: failure },
      );
    if (
      primary &&
      secondary &&
      primary.revision === secondary.revision &&
      JSON.stringify(primary) !== JSON.stringify(secondary)
    )
      throw new Error("Automation dispatch ledger copies disagree.");
    this.stored =
      primary && (!secondary || primary.revision >= secondary.revision)
        ? primary
        : (secondary ?? { version: 1, revision: 0, approvals: [], fires: [] });
  }
  private save(next: Stored): void {
    if (this.failed)
      throw new Error("Automation dispatch ledger requires recovery.");
    const value = { ...next, revision: this.stored.revision + 1 };
    if (
      Buffer.byteLength(JSON.stringify(value)) > 8_000_000 ||
      value.approvals.length > 2_000 ||
      value.fires.length > 5_000
    )
      throw new Error(
        "Automation dispatch ledger is full. No run was submitted.",
      );
    try {
      mkdirSync(resolve(this.path, ".."), { recursive: true, mode: 0o700 });
      writeJsonAtomicSync(this.path, value, { trailingNewline: true });
      chmodSync(this.path, 0o600);
      writeJsonAtomicSync(this.backup, value, { trailingNewline: true });
      chmodSync(this.backup, 0o600);
      this.stored = value;
    } catch (error) {
      this.failed = true;
      throw error;
    }
  }
  approval(id: string): AutomationTargetApproval | undefined {
    if (this.failed)
      throw new Error("Automation dispatch ledger requires recovery.");
    return structuredClone(this.stored.approvals.find((row) => row.id === id));
  }
  approve(row: AutomationTargetApproval): void {
    this.save({
      ...this.stored,
      approvals: [...this.stored.approvals, structuredClone(row)],
    });
  }
  get(id: string): AutomationTargetFire | undefined {
    if (this.failed)
      throw new Error("Automation dispatch ledger requires recovery.");
    return structuredClone(this.stored.fires.find((row) => row.fireId === id));
  }
  forKey(jobId: string, digest: string): AutomationTargetFire | undefined {
    return this.list().find(
      (row) => row.jobId === jobId && row.fireKeyDigest === digest,
    );
  }
  byRun(runId: string): AutomationTargetFire | undefined {
    return this.list().find((row) => row.runId === runId);
  }
  list(): AutomationTargetFire[] {
    if (this.failed)
      throw new Error("Automation dispatch ledger requires recovery.");
    return structuredClone(this.stored.fires);
  }
  prepare(row: AutomationTargetFire): void {
    if (this.forKey(row.jobId, row.fireKeyDigest))
      throw new Error("Automation fire identity already exists.");
    this.save({
      ...this.stored,
      fires: [...this.stored.fires, structuredClone(row)],
    });
  }
  update(
    id: string,
    status: AutomationTargetFire["status"],
  ): AutomationTargetFire {
    const row = this.get(id);
    if (!row) throw new Error("Automation fire not found.");
    if (["complete", "cancelled", "error"].includes(row.status)) return row;
    const next = { ...row, status, updatedAt: new Date().toISOString() };
    this.save({
      ...this.stored,
      fires: this.stored.fires.map((fire) =>
        fire.fireId === id ? next : fire,
      ),
    });
    return structuredClone(next);
  }
}
