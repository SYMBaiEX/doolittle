import type { AgentRuntime } from "@elizaos/core";
import { executeRawSql, sqlLiteral } from "@elizaos/plugin-sql";

export async function hasStorageMigration(
  runtime: AgentRuntime,
  name: string,
): Promise<boolean> {
  const {
    rows: [table],
  } = await executeRawSql(
    runtime,
    "SELECT to_regclass('doolittle.storage_migrations') IS NOT NULL AS present",
  );
  if (table?.present !== true) return false;

  const { rows } = await executeRawSql(
    runtime,
    `SELECT 1 FROM doolittle.storage_migrations
     WHERE agent_id = ${sqlLiteral(runtime.agentId)}::uuid
       AND name = ${sqlLiteral(name)}`,
  );
  return rows.length !== 0;
}

/** Persist migration state with the destination data, outside evictable caches. */
export async function recordStorageMigration(
  runtime: AgentRuntime,
  name: string,
): Promise<void> {
  await executeRawSql(runtime, "CREATE SCHEMA IF NOT EXISTS doolittle");
  await executeRawSql(
    runtime,
    `CREATE TABLE IF NOT EXISTS doolittle.storage_migrations (
      agent_id uuid NOT NULL,
      name text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (agent_id, name)
    )`,
  );
  await executeRawSql(
    runtime,
    `INSERT INTO doolittle.storage_migrations (agent_id, name)
     VALUES (${sqlLiteral(runtime.agentId)}::uuid, ${sqlLiteral(name)})
     ON CONFLICT (agent_id, name) DO NOTHING`,
  );
}
