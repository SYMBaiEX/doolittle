import type { SessionDatabase } from "../database";

export interface TranscriptCheckpoint {
  roomId: string;
  agentId: string;
  throughId: string;
  throughAt: string;
  fingerprint: string;
}

export function installTranscriptCheckpointSchema(db: SessionDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_transcript_checkpoints (
      session_id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      through_id TEXT NOT NULL,
      through_at TEXT NOT NULL,
      fingerprint TEXT NOT NULL
    );

    CREATE TRIGGER IF NOT EXISTS transcript_checkpoint_on_insert
      AFTER INSERT ON messages
      BEGIN
        DELETE FROM session_transcript_checkpoints WHERE session_id = NEW.session_id
          AND (NEW.created_at, NEW.id) <= (through_at, through_id);
      END;

    CREATE TRIGGER IF NOT EXISTS transcript_checkpoint_on_update
      AFTER UPDATE ON messages
      BEGIN
        DELETE FROM session_transcript_checkpoints
          WHERE session_id IN (OLD.session_id, NEW.session_id);
      END;

    CREATE TRIGGER IF NOT EXISTS transcript_checkpoint_on_delete
      AFTER DELETE ON messages
      BEGIN
        DELETE FROM session_transcript_checkpoints WHERE session_id = OLD.session_id;
      END;
  `);
}
