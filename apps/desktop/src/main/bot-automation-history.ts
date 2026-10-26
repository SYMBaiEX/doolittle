import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import type { AutomationTargetFire } from "./bot-automation-ledger";

/** Cold receipts remain indexed on disk for permanent duplicate prevention. */
export class BotAutomationHistory {
  private required: boolean;
  constructor(private readonly path: string) {
    this.required = existsSync(path);
  }

  exists(): boolean {
    const exists = existsSync(this.path);
    if (this.required && !exists)
      throw new Error("Automation history is missing. Recovery is required.");
    return exists;
  }

  private open(): DatabaseSync {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    const created = !existsSync(this.path);
    if (created) writeFileSync(this.path, "", { flag: "wx", mode: 0o600 });
    const info = lstatSync(this.path);
    if (!info.isFile() || info.isSymbolicLink())
      throw new Error("Automation history is not a regular file.");
    chmodSync(this.path, 0o600);
    const db = new DatabaseSync(this.path);
    try {
      if (created)
        db.exec(`CREATE TABLE fires (
        fire_id TEXT PRIMARY KEY, job_id TEXT NOT NULL, digest TEXT NOT NULL,
        run_id TEXT NOT NULL UNIQUE, record TEXT NOT NULL,
        UNIQUE(job_id, digest)
      )`);
      else
        db.prepare(
          "SELECT fire_id, job_id, digest, run_id, record FROM fires LIMIT 0",
        ).all();
      this.required = true;
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

  /** An archive commit may precede an interrupted hot-ledger publication. */
  reconcile(fires: AutomationTargetFire[]): AutomationTargetFire[] {
    if (!this.exists()) return fires;
    const db = this.open();
    try {
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

  retire(fires: AutomationTargetFire[]): void {
    if (!fires.length) return;
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
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    } finally {
      db.close();
    }
  }
}
