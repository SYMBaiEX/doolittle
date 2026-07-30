import type { SessionDatabase } from "@/services/session/database";

export function migrateSessionDatabase(db: SessionDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      room_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      attachments_json TEXT,
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

    CREATE TABLE IF NOT EXISTS session_lineage (
      session_id TEXT PRIMARY KEY,
      parent_session_id TEXT NOT NULL,
      forked_from_message_id TEXT NOT NULL,
      root_session_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS message_origins (
      message_id TEXT PRIMARY KEY,
      origin_message_id TEXT NOT NULL,
      source_session_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS session_imports (
      session_id TEXT PRIMARY KEY,
      archive_version INTEGER NOT NULL,
      source_application TEXT NOT NULL,
      source_session_id TEXT NOT NULL,
      source_root_session_id TEXT,
      imported_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      instructions TEXT,
      color TEXT,
      icon TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      primary_path TEXT,
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_resources (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS session_projects (
      session_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_projects_active_updated_at
      ON projects (archived_at, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_project_resources_project_created_at
      ON project_resources (project_id, created_at ASC);

    CREATE INDEX IF NOT EXISTS idx_session_projects_project_id
      ON session_projects (project_id, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_messages_session_created_at
      ON messages (session_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_messages_session_role_created_at
      ON messages (session_id, role, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_messages_room_created_at
      ON messages (room_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_session_lineage_parent
      ON session_lineage (parent_session_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_session_lineage_root
      ON session_lineage (root_session_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_message_origins_source
      ON message_origins (source_session_id, origin_message_id);

    CREATE INDEX IF NOT EXISTS idx_session_imports_source
      ON session_imports (source_application, source_session_id, imported_at DESC);

  `);

  const messageColumns = db
    .query("PRAGMA table_info(messages)")
    .all() as Array<{
    name: string;
  }>;
  if (!messageColumns.some((column) => column.name === "attachments_json")) {
    db.exec("ALTER TABLE messages ADD COLUMN attachments_json TEXT");
  }

  const projectColumns = db
    .query("PRAGMA table_info(projects)")
    .all() as Array<{ name: string }>;
  for (const [name, definition] of [
    ["instructions", "TEXT"],
    ["color", "TEXT"],
    ["icon", "TEXT"],
    ["pinned", "INTEGER NOT NULL DEFAULT 0"],
    ["primary_path", "TEXT"],
  ] as const) {
    if (!projectColumns.some((column) => column.name === name)) {
      db.exec(`ALTER TABLE projects ADD COLUMN ${name} ${definition}`);
    }
  }
}
