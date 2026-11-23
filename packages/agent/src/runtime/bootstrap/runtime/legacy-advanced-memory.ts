import { existsSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { AgentRuntime, JsonValue, UUID } from "@elizaos/core";
import { LongTermMemoryCategory } from "@elizaos/core";
import {
  AdvancedMemoryStorageService,
  executeRawSql,
  PgliteDatabaseAdapter,
  sqlLiteral,
} from "@elizaos/plugin-sql";
import { NodeSessionDatabase } from "../../../services/session/database";
import {
  hasStorageMigration,
  recordStorageMigration,
} from "./storage-migrations";

const IMPORT_RECEIPT = "legacy-advanced-memory-v1";
const PAGE_SIZE = 100;
const UUID_PATTERN = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/iu;

interface LegacyMemory {
  id: UUID;
  entity_id: UUID;
  category: LongTermMemoryCategory;
  content: string;
  metadata: string | null;
  embedding: string | null;
  confidence: number | null;
  source: string | null;
  created_at: string;
  updated_at: string;
  last_accessed_at: string | null;
  access_count: number | null;
}

function timestamp(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("Legacy advanced memory contains an invalid timestamp.");
  }
  return parsed.toISOString();
}

function parseLegacyJson(raw: string | null, field: string): unknown {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`Legacy advanced memory contains invalid ${field}.`);
  }
}

function matchesStoredEmbedding(
  legacy: readonly number[] | undefined,
  native: readonly number[] | undefined,
): boolean {
  if (legacy === undefined) return native === undefined;
  // The SQL adapter rounds before writing to pgvector's float32 storage.
  return (
    legacy.length === native?.length &&
    legacy.every(
      (value, index) =>
        Math.fround(Number(value.toFixed(6))) === Math.fround(native[index]),
    )
  );
}

async function importMemory(
  runtime: AgentRuntime,
  service: AdvancedMemoryStorageService,
  row: LegacyMemory,
): Promise<void> {
  const accessCount = row.access_count ?? 0;
  if (
    !UUID_PATTERN.test(row.id) ||
    !UUID_PATTERN.test(row.entity_id) ||
    !Object.values(LongTermMemoryCategory).includes(row.category) ||
    !Number.isSafeInteger(accessCount) ||
    accessCount < 0
  ) {
    throw new Error("Legacy advanced memory contains an invalid record.");
  }
  const createdAt = timestamp(row.created_at);
  const updatedAt = timestamp(row.updated_at);
  const lastAccessedAt = row.last_accessed_at
    ? timestamp(row.last_accessed_at)
    : null;
  const metadata = parseLegacyJson(row.metadata, "metadata");
  if (
    metadata !== undefined &&
    (metadata === null ||
      typeof metadata !== "object" ||
      Array.isArray(metadata))
  ) {
    throw new Error("Legacy advanced memory contains invalid metadata.");
  }
  const embedding = parseLegacyJson(row.embedding, "embedding");
  if (
    embedding !== undefined &&
    (!Array.isArray(embedding) || !embedding.every(Number.isFinite))
  ) {
    throw new Error("Legacy advanced memory contains an invalid embedding.");
  }

  // Some profiles reset PGlite while retaining their original state.db. Recover
  // the exact missing identity without replacing its name or linking accounts.
  let entity = await runtime.getEntityById(row.entity_id);
  if (!entity) {
    await runtime.createEntity({
      id: row.entity_id,
      agentId: runtime.agentId,
      names: [],
    });
    entity = await runtime.getEntityById(row.entity_id);
  }
  if (entity?.agentId !== runtime.agentId) {
    throw new Error(
      "Legacy advanced memory identity is unavailable for this runtime.",
    );
  }

  const content = runtime.redactSecrets(row.content);
  const vector = embedding as number[] | undefined;
  const stored = await service
    .storeLongTermMemory({
      id: row.id,
      agentId: runtime.agentId,
      entityId: row.entity_id,
      category: row.category,
      content,
      metadata: metadata as Record<string, JsonValue> | undefined,
      embedding: vector,
      confidence: row.confidence ?? undefined,
      source: row.source ?? undefined,
    })
    .catch(() => {
      throw new Error("The SDK could not import a legacy advanced memory.");
    });
  if (
    stored.id !== row.id ||
    stored.entityId !== row.entity_id ||
    stored.content !== content ||
    stored.category !== row.category ||
    stored.confidence !== (row.confidence ?? undefined) ||
    stored.source !== (row.source?.trim() || undefined) ||
    !isDeepStrictEqual(stored.metadata, metadata) ||
    !matchesStoredEmbedding(vector, stored.embedding)
  ) {
    throw new Error("Legacy advanced memory conflicts with a native record.");
  }

  // The SDK assigns correct ownership and synthetic rooms, but its storage
  // API treats persistence as a new observation. Restore historical fields
  // without rewriting the semantic content, vector or other native metadata.
  const { rows } = await executeRawSql(
    runtime,
    `UPDATE public.memories
       SET created_at = ${sqlLiteral(createdAt)}::timestamptz AT TIME ZONE 'UTC',
           metadata = jsonb_set(metadata, '{advancedMemory}',
             (metadata->'advancedMemory') || jsonb_build_object(
               'updatedAt', ${sqlLiteral(updatedAt)}::text,
               'lastAccessedAt', ${lastAccessedAt ? sqlLiteral(lastAccessedAt) : "NULL"}::text,
               'accessCount', ${accessCount}::bigint
             ), false)
       WHERE id = ${sqlLiteral(row.id)}::uuid
         AND agent_id = ${sqlLiteral(runtime.agentId)}::uuid
         AND type = 'long_term_memories'
         AND metadata->'advancedMemory'->>'originalEntityId' = ${sqlLiteral(row.entity_id)}
         AND metadata->'advancedMemory'->>'kind' = 'long_term_memory'
       RETURNING id`,
  );
  if (rows.length !== 1) {
    throw new Error("Could not verify the imported native advanced memory.");
  }
}

export async function migrateLegacyAdvancedMemories(
  runtime: AgentRuntime,
  dataDir: string,
): Promise<void> {
  // Legacy SQLite facts are local. A configured remote database or ephemeral
  // PGlite runtime must neither receive them nor record a transient receipt.
  if (!(runtime.adapter instanceof PgliteDatabaseAdapter)) return;
  const destination = runtime.adapter.getPgliteDataDir();
  if (
    !destination ||
    destination === ":memory:" ||
    destination.includes("://")
  ) {
    return;
  }
  const path = join(dataDir, "state.db");
  if (!existsSync(path)) return;
  const legacy = new NodeSessionDatabase(path, {
    readOnly: true,
    timeout: 5_000,
  });
  try {
    if (
      !legacy
        .query(`SELECT 1 FROM sqlite_schema
        WHERE type = 'table' AND name = 'long_term_memories'`)
        .get() ||
      !legacy
        .query("SELECT 1 FROM long_term_memories WHERE agent_id = ?1 LIMIT 1")
        .get(runtime.agentId) ||
      (await hasStorageMigration(runtime, IMPORT_RECEIPT))
    ) {
      return;
    }

    const service = await runtime.getServiceLoadPromise(
      AdvancedMemoryStorageService.serviceType,
    );
    if (!(service instanceof AdvancedMemoryStorageService)) {
      throw new Error(
        "Native ElizaOS advanced memory must be ready before importing legacy memories.",
      );
    }
    const page =
      legacy.query(`SELECT id, entity_id, category, content, metadata,
      embedding, confidence, source, created_at, updated_at, last_accessed_at, access_count
      FROM long_term_memories WHERE agent_id = ?1 AND id > ?2
      ORDER BY id LIMIT ${PAGE_SIZE}`);
    let cursor = "";
    for (;;) {
      const rows = page.all(runtime.agentId, cursor) as LegacyMemory[];
      if (!rows.length) break;
      for (const row of rows) await importMemory(runtime, service, row);
      cursor = rows[rows.length - 1].id;
    }
    await recordStorageMigration(runtime, IMPORT_RECEIPT);
  } finally {
    legacy.close();
  }
}
