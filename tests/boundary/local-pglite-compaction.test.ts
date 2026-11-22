import { existsSync, realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGliteClientManager } from "@elizaos/plugin-sql";
import { expect, it } from "vitest";
import {
  assertPgliteRepairIdle,
  pgliteRepairDirectory,
} from "../../packages/agent/src/runtime/bootstrap/env/pglite";
import { compactLocalPglite } from "../../scripts/compact-local-pglite";

it("blocks an open cluster and compacts a verified offline copy with rollback", async () => {
  const root = await mkdtemp(
    join(realpathSync(tmpdir()), "doolittle-compact-"),
  );
  const directory = join(root, "pglite");
  try {
    const original = new PGliteClientManager({ dataDir: directory });
    try {
      await original.initialize();
      const db = original.getConnection();
      await db.exec(`
        CREATE TABLE trajectories (id int, payload text);
        CREATE TABLE memories (payload text);
        INSERT INTO memories VALUES ('keep this memory');
        INSERT INTO trajectories
          SELECT n, (SELECT string_agg(md5(n::text || ':' || i::text), '') FROM generate_series(1, 1000) i)
          FROM generate_series(1, 35) n;
        DELETE FROM trajectories WHERE id <> 1;
      `);
      await expect(compactLocalPglite(directory)).rejects.toThrow(
        /close all runtimes/i,
      );
    } finally {
      await original.close();
    }

    const result = await compactLocalPglite(directory);
    expect(result.tables).toHaveLength(1);
    const [table] = result.tables;
    expect(table?.rows).toBe(1);
    expect(table?.beforeBytes).toBeGreaterThan(table?.afterBytes ?? Infinity);
    expect(
      result.rollback && existsSync(join(result.rollback, "PG_VERSION")),
    ).toBe(true);
    expect(existsSync(pgliteRepairDirectory(directory))).toBe(false);
    expect(() => assertPgliteRepairIdle(directory)).not.toThrow();

    const reopened = new PGliteClientManager({ dataDir: directory });
    try {
      await reopened.initialize();
      const db = reopened.getConnection();
      expect((await db.query("SELECT payload FROM memories")).rows).toEqual([
        { payload: "keep this memory" },
      ]);
      expect((await db.query("SELECT id FROM trajectories")).rows).toEqual([
        { id: 1 },
      ]);
    } finally {
      await reopened.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
