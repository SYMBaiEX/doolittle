import {
  constants,
  existsSync,
  linkSync,
  lstatSync,
  realpathSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PGliteClientManager } from "@elizaos/plugin-sql";
import { pgliteRepairDirectory } from "../packages/agent/src/runtime/bootstrap/env/pglite";

const tables = ["public.trajectories", "public.trajectory_steps"] as const;
const ownerLock = "eliza-pglite.lock";

type TableData = { rows: number; digest: string | null; bytes: number };
type Connection = ReturnType<PGliteClientManager["getConnection"]>;

async function inspectTables(db: Connection) {
  const result = new Map<string, TableData>();
  for (const table of tables) {
    const {
      rows: [exists],
    } = await db.query<{ present: boolean }>(
      "SELECT to_regclass($1) IS NOT NULL AS present",
      [table],
    );
    if (!exists?.present) continue;

    const {
      rows: [data],
    } = await db.query<TableData>(`
      SELECT count(*) AS rows, md5(string_agg(hash, '' ORDER BY hash)) AS digest,
        pg_total_relation_size('${table}') AS bytes
      FROM (SELECT md5(row::text) AS hash FROM ${table} AS row) AS hashes
    `);
    if (!data) throw new Error(`Could not inspect ${table}.`);
    result.set(table, data);
  }
  return result;
}

async function withDatabase<T>(
  dataDir: string,
  operation: (database: PGliteClientManager) => Promise<T>,
): Promise<T> {
  const database = new PGliteClientManager({ dataDir });
  try {
    await database.initialize();
    return await operation(database);
  } finally {
    await database.close();
  }
}

async function assertPhysicalDirectory(path: string): Promise<void> {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.isDirectory())
      await assertPhysicalDirectory(join(path, entry.name));
    else if (!entry.isFile())
      throw new Error(`Unsupported entry in database: ${entry.name}`);
  }
}

export async function compactLocalPglite(input: string) {
  if (!isAbsolute(input))
    throw new Error("Pass an absolute PGlite data directory.");
  const dataDir = resolve(input);
  if (realpathSync(dataDir) !== dataDir || !lstatSync(dataDir).isDirectory()) {
    throw new Error("Expected a physical PGlite directory.");
  }
  for (const entry of ["PG_VERSION", "global/pg_control"]) {
    if (!lstatSync(join(dataDir, entry)).isFile())
      throw new Error("Expected an existing PGlite cluster.");
  }
  if (
    ["postmaster.pid", ownerLock].some((name) =>
      existsSync(join(dataDir, name)),
    )
  ) {
    throw new Error(
      "Close all runtimes using this database before compacting it.",
    );
  }
  await assertPhysicalDirectory(dataDir);

  const transaction = pgliteRepairDirectory(dataDir);
  const original = join(transaction, "original");
  const candidate = join(transaction, "candidate");
  const lease = join(transaction, "lease");
  const rollback = `${dataDir}.before-compaction-${Date.now()}`;
  await mkdir(transaction, { mode: 0o700 });
  try {
    await writeFile(
      lease,
      JSON.stringify({
        pid: process.pid,
        createdAt: new Date().toISOString(),
        dataDir,
      }),
      { mode: 0o600, flag: "wx" },
    );
    const changes = await withDatabase(dataDir, async (source) => {
      const before = await inspectTables(source.getConnection());
      await source.withQuiescedDataDir(async () => {
        await cp(dataDir, candidate, {
          recursive: true,
          errorOnExist: true,
          force: false,
          mode: constants.COPYFILE_FICLONE,
          filter: (path) =>
            !["postmaster.pid", ownerLock].includes(basename(path)),
        });
      });

      // Keep the SDK's source lock through candidate validation so a worker
      // that was already starting cannot write to the cluster we copied.
      await withDatabase(candidate, async (database) => {
        const db = database.getConnection();
        for (const table of before.keys())
          await db.exec(`VACUUM (FULL, ANALYZE) ${table}`);
        await db.exec("CHECKPOINT");
      });
      const after = await withDatabase(candidate, (database) =>
        inspectTables(database.getConnection()),
      );
      return [...before].map(([table, baseline]) => {
        const compacted = after.get(table);
        if (
          !compacted ||
          baseline.rows !== compacted.rows ||
          baseline.digest !== compacted.digest
        ) {
          throw new Error(
            `Verification failed for ${table}. The original database was kept.`,
          );
        }
        return {
          table,
          rows: Number(compacted.rows),
          beforeBytes: Number(baseline.bytes),
          afterBytes: Number(compacted.bytes),
        };
      });
    });
    if (
      !changes.some(({ beforeBytes, afterBytes }) => beforeBytes > afterBytes)
    ) {
      return { tables: changes, rollback: null };
    }

    // Acquire the same exclusive lease as the SDK at the handoff. A running
    // worker wins by creating its lock first, and promotion then aborts.
    let lock = join(dataDir, ownerLock);
    linkSync(lease, lock);
    try {
      renameSync(dataDir, original);
      lock = join(original, ownerLock);
      renameSync(candidate, dataDir);
      renameSync(transaction, rollback);
      lock = join(rollback, "original", ownerLock);
    } catch (error) {
      // Keep the marker and both copies if the swap was interrupted.
      if (!existsSync(dataDir)) {
        renameSync(original, dataDir);
        lock = join(dataDir, ownerLock);
      }
      throw error;
    } finally {
      unlinkSync(lock);
    }
    return { tables: changes, rollback: join(rollback, "original") };
  } finally {
    if (existsSync(transaction) && !existsSync(original)) {
      await rm(transaction, { recursive: true, force: true });
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [dataDir, ...rest] = process.argv
    .slice(2)
    .filter((arg) => arg !== "--");
  if (!dataDir || rest.length)
    throw new Error(
      "Usage: nub scripts/compact-local-pglite.ts /absolute/path/to/pglite",
    );
  console.log(JSON.stringify(await compactLocalPglite(dataDir), null, 2));
}
