import {
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
} from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import type {
  AutomationTargetApproval,
  AutomationTargetFire,
} from "./bot-automation-ledger";

/** Cold receipts remain indexed on disk for permanent duplicate prevention. */
export class BotAutomationHistory {
  private required: boolean;
  private allowInitializeEmpty = false;
  constructor(private readonly path: string) {
    this.required = existsSync(path);
  }

  setRecoveryRequirement(required: boolean): void {
    this.required ||= required;
    this.allowInitializeEmpty = !required;
  }

  exists(): boolean {
    const exists = existsSync(this.path);
    if (this.required && !exists)
      throw new Error("Automation history is missing. Recovery is required.");
    return exists;
  }

  private open(): DatabaseSync {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    let fd: number;
    const flags =
      constants.O_RDWR |
      (constants.O_NOFOLLOW ?? 0) |
      (constants.O_NONBLOCK ?? 0);
    try {
      fd = openSync(this.path, "wx+", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      fd = openSync(this.path, flags);
    }
    try {
      if (
        !fstatSync(fd).isFile() ||
        (!constants.O_NOFOLLOW && lstatSync(this.path).isSymbolicLink())
      ) {
        throw new Error("Automation history is not a regular file.");
      }
      fchmodSync(fd, 0o600);
    } finally {
      closeSync(fd);
    }
    const db = new DatabaseSync(this.path);
    try {
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
        )
        .all();
      if (!tables.length && this.allowInitializeEmpty) {
        db.exec("BEGIN IMMEDIATE");
        try {
          db.exec(`CREATE TABLE fires (
            fire_id TEXT PRIMARY KEY, job_id TEXT NOT NULL, digest TEXT NOT NULL,
            run_id TEXT NOT NULL UNIQUE, record TEXT NOT NULL,
            UNIQUE(job_id, digest)
          ); CREATE TABLE approvals (id TEXT PRIMARY KEY, record TEXT NOT NULL)`);
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      }
      db.prepare(
        "SELECT fire_id, job_id, digest, run_id, record FROM fires LIMIT 0",
      ).all();
      db.prepare("SELECT id, record FROM approvals LIMIT 0").all();
      this.required = true;
      this.allowInitializeEmpty = false;
      return db;
    } catch (error) {
      db.close();
      throw error;
    }
  }

  private decode(
    row: Record<string, unknown> | undefined,
  ): AutomationTargetFire | undefined {
    if (!row) return undefined;
    const fire = JSON.parse(String(row.record)) as AutomationTargetFire;
    if (
      fire.fireId !== row.fire_id ||
      fire.jobId !== row.job_id ||
      fire.fireKeyDigest !== row.digest ||
      fire.runId !== row.run_id ||
      !["complete", "cancelled", "error"].includes(fire.status)
    ) {
      throw new Error("Automation history receipt is invalid.");
    }
    return fire;
  }

  find(
    field: "fire_id" | "run_id" | "job_id",
    id: string,
    digest?: string,
  ): AutomationTargetFire | undefined {
    if (!this.exists()) return undefined;
    const db = this.open();
    try {
      return this.decode(
        field === "job_id"
          ? db
              .prepare("SELECT * FROM fires WHERE job_id = ? AND digest = ?")
              .get(id, digest ?? "")
          : db.prepare(`SELECT * FROM fires WHERE ${field} = ?`).get(id),
      );
    } finally {
      db.close();
    }
  }

  approval(id: string): AutomationTargetApproval | undefined {
    if (!this.exists()) return undefined;
    const db = this.open();
    try {
      const row = db
        .prepare("SELECT record FROM approvals WHERE id = ?")
        .get(id);
      if (!row) return undefined;
      const approval = JSON.parse(
        String(row.record),
      ) as AutomationTargetApproval;
      if (approval.id !== id)
        throw new Error("Automation approval history is invalid.");
      return approval;
    } finally {
      db.close();
    }
  }

  /** An archive commit may precede an interrupted hot-ledger publication. */
  reconcile(
    fires: AutomationTargetFire[],
    approvals: AutomationTargetApproval[],
  ): AutomationTargetFire[] {
    if (!this.exists()) return fires;
    const db = this.open();
    try {
      const lookupApproval = db.prepare(
        "SELECT record FROM approvals WHERE id = ?",
      );
      for (const approval of approvals) {
        const archived = lookupApproval.get(approval.id);
        if (
          archived &&
          !isDeepStrictEqual(JSON.parse(String(archived.record)), approval)
        )
          throw new Error("Automation approval histories disagree.");
      }
      const lookup = db.prepare("SELECT * FROM fires WHERE fire_id = ?");
      return fires.filter((fire) => {
        const archived = this.decode(lookup.get(fire.fireId));
        if (!archived) return true;
        const { status: _oldStatus, updatedAt: _oldTime, ...identity } = fire;
        const {
          status: _status,
          updatedAt: _time,
          ...archivedIdentity
        } = archived;
        if (!isDeepStrictEqual(identity, archivedIdentity))
          throw new Error("Automation history identities disagree.");
        return false;
      });
    } finally {
      db.close();
    }
  }

  retire(
    fires: AutomationTargetFire[],
    approvals: AutomationTargetApproval[],
  ): void {
    if (!fires.length && !approvals.length) return;
    const db = this.open();
    try {
      db.exec("BEGIN IMMEDIATE");
      const lookup = db.prepare("SELECT * FROM fires WHERE fire_id = ?");
      const insert = db.prepare("INSERT INTO fires VALUES (?, ?, ?, ?, ?)");
      for (const fire of fires) {
        const previous = this.decode(lookup.get(fire.fireId));
        if (previous) {
          if (!isDeepStrictEqual(previous, fire))
            throw new Error("Automation history receipts disagree.");
          continue;
        }
        if (!["complete", "cancelled", "error"].includes(fire.status))
          throw new Error("Active automation cannot be archived.");
        insert.run(
          fire.fireId,
          fire.jobId,
          fire.fireKeyDigest,
          fire.runId,
          JSON.stringify(fire),
        );
      }
      const lookupApproval = db.prepare(
        "SELECT record FROM approvals WHERE id = ?",
      );
      const insertApproval = db.prepare("INSERT INTO approvals VALUES (?, ?)");
      for (const approval of approvals) {
        const previous = lookupApproval.get(approval.id);
        if (previous) {
          if (!isDeepStrictEqual(JSON.parse(String(previous.record)), approval))
            throw new Error("Automation approval histories disagree.");
        } else insertApproval.run(approval.id, JSON.stringify(approval));
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    } finally {
      db.close();
    }
  }
}
