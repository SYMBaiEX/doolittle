import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRuntime, LongTermMemoryCategory } from "@elizaos/core";
import sqlPlugin, {
  AdvancedMemoryStorageService,
  executeRawSql,
} from "@elizaos/plugin-sql";
import { expect, it, vi } from "vitest";
import { migrateLegacyAdvancedMemories } from "../../packages/agent/src/runtime/bootstrap/runtime/legacy-advanced-memory";
import { NodeSessionDatabase } from "../../packages/agent/src/services/session/database";

it("imports legacy facts into the SDK store without duplicates, lost timestamps, or resurrection", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doolittle-legacy-memory-"));
  const agentId = randomUUID();
  const entityId = randomUUID();
  const id = randomUUID();
  const otherAgentId = randomUUID();
  const otherId = randomUUID();
  const category = LongTermMemoryCategory.SEMANTIC;
  const content = "An existing fact about the workspace";
  const metadata = { notes: { origin: "legacy profile" } };
  const embedding = Array.from({ length: 384 }, (_, index) =>
    index ? 0.123456789 : -0.113344556,
  );
  const createdAt = "2025-03-16T12:44:18.500Z";
  const updatedAt = "2025-05-28T19:40:00.333Z";
  const lastAccessedAt = "2026-01-14T08:01:20.000Z";
  const path = join(directory, "state.db");
  const legacy = new NodeSessionDatabase(path);
  try {
    legacy.exec(`CREATE TABLE long_term_memories (
      id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, entity_id TEXT NOT NULL,
      category TEXT NOT NULL, content TEXT NOT NULL, metadata TEXT,
      embedding TEXT, confidence REAL, source TEXT, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, last_accessed_at TEXT, access_count INTEGER
    )`);
    const insert = legacy.query(`INSERT INTO long_term_memories VALUES (
      ?1, ?2, ?3, ?4, ?5, ?6, ?7, 0.7, 'fixture', ?8, ?9, ?10, 9
    )`);
    for (const [memory, agent] of [
      [id, agentId],
      [otherId, otherAgentId],
    ]) {
      insert.run(
        memory,
        agent,
        entityId,
        category,
        content,
        JSON.stringify(metadata),
        JSON.stringify(embedding),
        createdAt,
        updatedAt,
        lastAccessedAt,
      );
    }
  } finally {
    legacy.close();
  }

  vi.stubEnv("ELIZA_BENCH_DISABLE_DOTENV", "1");
  vi.stubEnv("ELIZA_STATE_DIR", directory);
  vi.stubEnv("POSTGRES_URL", "");
  vi.stubEnv("SECRET_SALT", randomBytes(32).toString("hex"));
  const start = () =>
    new AgentRuntime({
      character: {
        id: agentId,
        name: "Legacy advanced memory fixture",
        settings: {
          PGLITE_DATA_DIR: join(directory, "pglite"),
          POSTGRES_URL: "",
        },
      },
      plugins: [sqlPlugin],
      enableAutonomy: false,
    });
  let runtime = start();
  try {
    await expect(
      migrateLegacyAdvancedMemories(
        { agentId, adapter: {} } as AgentRuntime,
        directory,
      ),
    ).resolves.toBeUndefined();
    await runtime.initialize();
    await migrateLegacyAdvancedMemories(runtime, directory);
    await migrateLegacyAdvancedMemories(runtime, directory);
    const service = (await runtime.getServiceLoadPromise(
      AdvancedMemoryStorageService.serviceType,
    )) as AdvancedMemoryStorageService;
    expect(service).toBeInstanceOf(AdvancedMemoryStorageService);
    expect(await service.getLongTermMemories(agentId, entityId)).toMatchObject([
      {
        id,
        agentId,
        entityId,
        category,
        content,
        metadata,
        confidence: 0.7,
        source: "fixture",
        createdAt: new Date(createdAt),
        updatedAt: new Date(updatedAt),
        lastAccessedAt: new Date(lastAccessedAt),
        accessCount: 9,
      },
    ]);
    const vector = (await runtime.getMemoryById(id))?.embedding;
    expect(vector).toHaveLength(embedding.length);
    expect(
      vector?.every(
        (actual, index) =>
          Math.fround(actual) ===
          Math.fround(Number(embedding[index].toFixed(6))),
      ),
    ).toBe(true);
    expect(await runtime.getMemoryById(otherId)).toBeNull();

    // An interrupted import may have created the native row before saving its
    // receipt. Retry must reject divergent native payloads and keep both copies.
    await executeRawSql(runtime, "DELETE FROM doolittle.storage_migrations");
    await service.updateLongTermMemory(id, agentId, entityId, {
      confidence: 0.9,
    });
    await expect(
      migrateLegacyAdvancedMemories(runtime, directory),
    ).rejects.toThrow(/conflicts with a native record/i);
    expect(await service.getLongTermMemories(agentId, entityId)).toMatchObject([
      { id, confidence: 0.9 },
    ]);
    await service.updateLongTermMemory(id, agentId, entityId, {
      confidence: 0.7,
    });
    await migrateLegacyAdvancedMemories(runtime, directory);
    expect(await service.getLongTermMemories(agentId, entityId)).toMatchObject([
      { id, updatedAt: new Date(updatedAt), accessCount: 9 },
    ]);

    await service.deleteLongTermMemory(id, agentId, entityId);
    await runtime.stop();

    runtime = start();
    await runtime.initialize();
    await migrateLegacyAdvancedMemories(runtime, directory);
    expect(await runtime.getMemoryById(id)).toBeNull();
    const preserved = new NodeSessionDatabase(path, { readOnly: true });
    try {
      expect(
        preserved
          .query("SELECT count(*) AS count FROM long_term_memories")
          .get(),
      ).toMatchObject({ count: 2 });
    } finally {
      preserved.close();
    }
  } finally {
    await runtime.stop();
    vi.unstubAllEnvs();
    rmSync(directory, { force: true, recursive: true });
  }
}, 25_000);
