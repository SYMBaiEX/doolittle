import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UUID } from "@elizaos/core";
import {
  createDatabaseAdapter,
  createMigratedSnapshot,
  plugin,
} from "@elizaos/plugin-sql";
import { expect, it } from "vitest";
import {
  DESKTOP_PGLITE_SEED_FILE,
  seedPackagedDesktopPglite,
  seedPgliteDataDirectory,
  verifyDesktopPgliteSeed,
} from "../../packages/agent/src/runtime/bootstrap/runtime/desktop-database-seed";

it("publishes a schema seed once and retains a saved agent on reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "doolittle-seed-test-"));
  const database = join(directory, "pglite");
  const agentId = "49426934-63c4-4c9b-8a79-850aa6fc9cb5" as UUID;
  const schema = [{ name: plugin.name, schema: plugin.schema ?? {} }];

  try {
    const archive = new Uint8Array(await createMigratedSnapshot(schema));
    expect(await seedPgliteDataDirectory(database, archive)).toBe(true);

    const adapter = createDatabaseAdapter({ dataDir: database }, agentId);
    try {
      await adapter.initialize();
      await adapter.runPluginMigrations?.(schema);
      expect(await adapter.getAgents()).toEqual([]);
      await adapter.createAgents([
        { id: agentId, name: "Saved agent", bio: [] },
      ]);
    } finally {
      await adapter.close();
    }

    expect(await seedPgliteDataDirectory(database, archive)).toBe(false);
    const reopened = createDatabaseAdapter({ dataDir: database }, agentId);
    try {
      await reopened.initialize();
      await reopened.runPluginMigrations?.(schema);
      expect(await reopened.getAgentsByIds([agentId])).toMatchObject([
        { id: agentId, name: "Saved agent" },
      ]);
    } finally {
      await reopened.close();
    }
    expect(await readdir(directory)).toEqual(["pglite"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 20_000);

it("falls back to standard initialization when there is no packaged seed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "doolittle-seed-test-"));
  try {
    expect(
      await seedPackagedDesktopPglite(directory, join(directory, "pglite")),
    ).toBe(false);
    expect(await readdir(directory)).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("rejects tampered archive bytes before attempting to restore a seed", () => {
  const receipt = {
    file: DESKTOP_PGLITE_SEED_FILE,
    sha256: "a".repeat(64),
    runtimeSha256: "b".repeat(64),
  } satisfies Parameters<typeof verifyDesktopPgliteSeed>[1];
  expect(() =>
    verifyDesktopPgliteSeed(
      "runtime-manifest.json",
      receipt,
      new Uint8Array([0x1f, 0x8b]),
    ),
  ).toThrow("does not match its runtime receipt");
});
