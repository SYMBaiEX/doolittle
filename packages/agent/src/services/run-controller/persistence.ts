import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { NodeSessionDatabase } from "../session/database";
import type { RunReceiptEnvelope, TaskRunEvent } from "./types";

interface PersistedJournal {
  lastId: number;
  events: TaskRunEvent[];
}

interface PersistedRuns {
  receipts: RunReceiptEnvelope[];
  journals: Map<string, PersistedJournal>;
}

export interface JournalChange {
  lastId: number;
  appended: TaskRunEvent[];
  trimmed: number;
  replace?: boolean;
}

interface PersistenceChanges {
  receipts: ReadonlyMap<string, RunReceiptEnvelope | null>;
  journals: ReadonlyMap<string, JournalChange | null>;
}

/** Client-owned run history shares the existing session database. */
export class RunJournalPersistence {
  private readonly db: NodeSessionDatabase;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.db = new NodeSessionDatabase(join(dataDir, "state.db"), {
      timeout: 5_000,
    });
  }

  initialize(
    restore: (persisted: PersistedRuns | null) => PersistenceChanges,
  ): void {
    this.transaction(() => {
      // The tables and the legacy import commit together. Existing empty
      // tables must never cause a second import from a stale legacy file.
      const migrated = this.db
        .query(
          "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'run_receipts'",
        )
        .get();
      if (!migrated) this.installTables();
      this.apply(restore(migrated ? this.read() : null));
    });
  }

  write(changes: PersistenceChanges): void {
    this.transaction(() => this.apply(changes));
  }

  close(): void {
    this.db.close();
  }

  private installTables(): void {
    this.db.exec(`
      CREATE TABLE run_receipts (
        sequence INTEGER PRIMARY KEY,
        run_id TEXT NOT NULL UNIQUE,
        payload TEXT NOT NULL
      );
      CREATE TABLE task_run_journals (
        run_id TEXT PRIMARY KEY,
        last_event_id INTEGER NOT NULL
      );
      CREATE TABLE task_run_events (
        sequence INTEGER PRIMARY KEY,
        run_id TEXT NOT NULL,
        terminal INTEGER NOT NULL,
        payload TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES task_run_journals(run_id) ON DELETE CASCADE
      );
      CREATE INDEX task_run_events_order ON task_run_events (run_id, sequence);
    `);
  }

  private read(): PersistedRuns {
    const receipts = this.db
      .query("SELECT payload FROM run_receipts ORDER BY sequence")
      .all() as Array<{ payload: string }>;
    const rows = this.db
      .query("SELECT run_id, last_event_id FROM task_run_journals")
      .all() as Array<{ run_id: string; last_event_id: number }>;
    const journals = new Map<string, PersistedJournal>();
    for (const row of rows) {
      journals.set(row.run_id, { lastId: row.last_event_id, events: [] });
    }
    const events = this.db
      .query("SELECT run_id, payload FROM task_run_events ORDER BY sequence")
      .all() as Array<{ run_id: string; payload: string }>;
    for (const row of events) {
      journals
        .get(row.run_id)
        ?.events.push(JSON.parse(row.payload) as TaskRunEvent);
    }
    return {
      receipts: receipts.map(
        ({ payload }) => JSON.parse(payload) as RunReceiptEnvelope,
      ),
      journals,
    };
  }

  private apply({ receipts, journals }: PersistenceChanges): void {
    if (receipts.size) {
      const upsert = this.db.query(`
        INSERT INTO run_receipts (run_id, payload) VALUES (?, ?)
        ON CONFLICT(run_id) DO UPDATE SET payload = excluded.payload
      `);
      const remove = this.db.query("DELETE FROM run_receipts WHERE run_id = ?");
      for (const [runId, receipt] of receipts) {
        if (receipt) upsert.run(runId, JSON.stringify(receipt));
        else remove.run(runId);
      }
    }
    if (journals.size) {
      const upsert = this.db.query(`
        INSERT INTO task_run_journals (run_id, last_event_id) VALUES (?, ?)
        ON CONFLICT(run_id) DO UPDATE SET last_event_id = excluded.last_event_id
      `);
      const append = this.db.query(
        "INSERT INTO task_run_events (run_id, terminal, payload) VALUES (?, ?, ?)",
      );
      const trim = this.db.query(`
        DELETE FROM task_run_events WHERE sequence IN (
          SELECT sequence FROM task_run_events
          WHERE run_id = ? AND terminal = 0 ORDER BY sequence LIMIT ?
        )
      `);
      const remove = this.db.query(
        "DELETE FROM task_run_journals WHERE run_id = ?",
      );
      for (const [runId, journal] of journals) {
        if (!journal) {
          remove.run(runId);
          continue;
        }
        if (journal.replace) remove.run(runId);
        upsert.run(runId, journal.lastId);
        if (journal.trimmed) trim.run(runId, journal.trimmed);
        for (const event of journal.appended) {
          append.run(runId, Number(event.terminal), JSON.stringify(event));
        }
      }
    }
  }

  private transaction(write: () => void): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      write();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
