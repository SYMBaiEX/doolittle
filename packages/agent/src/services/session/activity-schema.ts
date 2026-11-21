import type { SessionDatabase } from "./database";

const addActivity = `
  INSERT INTO session_message_activity (session_id, message_count, started_at, ended_at)
  VALUES (NEW.session_id, 1, NEW.created_at, NEW.created_at)
  ON CONFLICT(session_id) DO UPDATE SET
    message_count = message_count + 1,
    started_at = MIN(started_at, NEW.created_at),
    ended_at = MAX(ended_at, NEW.created_at);
`;

const removeActivity = `
  DELETE FROM session_message_activity
  WHERE session_id = OLD.session_id AND message_count = 1;

  UPDATE session_message_activity SET
    message_count = message_count - 1,
    started_at = CASE WHEN started_at = OLD.created_at THEN (
      SELECT MIN(created_at) FROM messages WHERE session_id = OLD.session_id
    ) ELSE started_at END,
    ended_at = CASE WHEN ended_at = OLD.created_at THEN (
      SELECT MAX(created_at) FROM messages WHERE session_id = OLD.session_id
    ) ELSE ended_at END
  WHERE session_id = OLD.session_id;
`;

/** Write-time projection for bounded session listing, in the message's transaction. */
export function installSessionActivitySchema(db: SessionDatabase): void {
  db.exec(`
    CREATE TABLE session_message_activity (
      session_id TEXT PRIMARY KEY,
      message_count INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL
    ) WITHOUT ROWID;

    INSERT INTO session_message_activity (session_id, message_count, started_at, ended_at)
    SELECT session_id, COUNT(*), MIN(created_at), MAX(created_at)
    FROM messages GROUP BY session_id;

    CREATE INDEX idx_session_message_activity_recency
      ON session_message_activity (ended_at DESC, session_id);

    CREATE INDEX idx_messages_global_created_at ON messages (created_at DESC);

    CREATE TRIGGER project_session_activity_on_insert AFTER INSERT ON messages
    BEGIN ${addActivity} END;

    CREATE TRIGGER project_session_activity_on_delete AFTER DELETE ON messages
    BEGIN ${removeActivity} END;

    CREATE TRIGGER project_session_activity_on_move
    AFTER UPDATE OF session_id, created_at ON messages
    WHEN OLD.session_id IS NOT NEW.session_id OR OLD.created_at IS NOT NEW.created_at
    BEGIN ${removeActivity} ${addActivity} END;
  `);
}
