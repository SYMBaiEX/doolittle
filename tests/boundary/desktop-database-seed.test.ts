import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { gzipSync } from "node:zlib";
import type { UUID } from "@elizaos/core";
import { createDatabaseAdapter, plugin } from "@elizaos/plugin-sql";
import { expect, it } from "vitest";
import {
  archiveClosedPgliteDataDirectory,
  DESKTOP_PGLITE_SEED_FILE,
  seedPackagedDesktopPglite,
  seedPgliteDataDirectory,
  verifyDesktopPgliteSeed,
} from "../../packages/agent/src/runtime/bootstrap/runtime/desktop-database-seed";

it("recovers an abandoned seed and retains a saved agent on reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "doolittle-seed-test-"));
  const database = join(directory, "pglite");
  const agentId = "49426934-63c4-4c9b-8a79-850aa6fc9cb5" as UUID;
  const schema = [{ name: plugin.name, schema: plugin.schema ?? {} }];

  try {
    const exited = spawnSync(process.execPath, ["-e", ""]);
    expect(exited.status).toBe(0);
    await mkdtemp(join(directory, `.pglite-seed-v1-${exited.pid}-`));
    const activeStage = await mkdtemp(
      join(directory, `.pglite-seed-v1-${process.pid}-`),
    );
    const olderStage = await mkdtemp(join(directory, ".pglite-seed-"));
    const source = join(directory, "source");
    const seed = createDatabaseAdapter({ dataDir: source }, agentId);
    try {
      await seed.initialize();
      await seed.runPluginMigrations?.(schema);
    } finally {
      await seed.close();
    }
    const archivePath = join(directory, "seed.tar.gz");
    await archiveClosedPgliteDataDirectory(source, archivePath);
    const archive = await readFile(archivePath);
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
    expect((await readdir(directory)).sort()).toEqual(
      [
        basename(activeStage),
        basename(olderStage),
        "pglite",
        "seed.tar.gz",
        "source",
      ].sort(),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 20_000);

it("leaves the profile untouched if a seed contains a link", async () => {
  const directory = await mkdtemp(join(tmpdir(), "doolittle-seed-test-"));
  try {
    const source = join(directory, "source");
    await mkdir(join(source, "global"), { recursive: true });
    await writeFile(join(source, "global", "pg_control"), "test header");
    await writeFile(join(source, "PG_VERSION"), "17");
    await symlink("../untouched", join(source, "outside"), "file");
    const archivePath = join(directory, "seed.tar.gz");
    await archiveClosedPgliteDataDirectory(source, archivePath);
    await expect(
      seedPgliteDataDirectory(
        join(directory, "pglite"),
        await readFile(archivePath),
      ),
    ).rejects.toThrow("does not contain a closed database");
    expect((await readdir(directory)).sort()).toEqual([
      "seed.tar.gz",
      "source",
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("bounds decompression and discards failed staging directories", async () => {
  const directory = await mkdtemp(join(tmpdir(), "doolittle-seed-test-"));
  const dataDir = join(directory, "pglite");
  try {
    const oversized = gzipSync(Buffer.alloc(64 * 1024 * 1024 + 1));
    await expect(
      seedPgliteDataDirectory(dataDir, oversized),
    ).rejects.toMatchObject({ code: "ERR_BUFFER_TOO_LARGE" });
    await expect(
      seedPgliteDataDirectory(dataDir, oversized.subarray(0, 32)),
    ).rejects.toMatchObject({ code: "Z_BUF_ERROR" });
    await expect(
      seedPgliteDataDirectory(dataDir, gzipSync(oversized)),
    ).rejects.toThrow("does not contain a closed database");
    expect(await readdir(directory)).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

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
