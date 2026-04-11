import type { Database } from "bun:sqlite";

export function migrateSessionDatabase(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      room_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      session_id,
      room_id,
      entity_id,
      role,
      text,
      created_at
    );

    CREATE TABLE IF NOT EXISTS session_metadata (
      session_id TEXT PRIMARY KEY,
      title TEXT,
      continuity_key TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session_created_at
      ON messages (session_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_messages_session_role_created_at
      ON messages (session_id, role, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_messages_room_created_at
      ON messages (room_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS long_term_memories (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      category TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      embedding TEXT,
      confidence REAL,
      source TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_accessed_at TEXT,
      access_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_long_term_memories_agent_entity
      ON long_term_memories (agent_id, entity_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_long_term_memories_agent_entity_category
      ON long_term_memories (agent_id, entity_id, category, created_at DESC);

    CREATE TABLE IF NOT EXISTS session_summaries (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      room_id TEXT NOT NULL,
      entity_id TEXT,
      summary TEXT NOT NULL,
      message_count INTEGER NOT NULL,
      last_message_offset INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      topics TEXT,
      metadata TEXT,
      embedding TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_session_summaries_agent_room
      ON session_summaries (agent_id, room_id, end_time DESC, updated_at DESC);
  `);
}
