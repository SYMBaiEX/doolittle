import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { lstat, mkdtemp, readdir, rename, rm } from "node:fs/promises";
import { findPackageJSON } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readRegularFile, readRegularFileSync } from "@doolittle/storage";

export const DESKTOP_PGLITE_SEED_FILE = "pglite-seed.tar.gz";
export const MAX_PGLITE_SEED_BYTES = 16 * 1024 * 1024;
const STAGED_SEED = /^\.pglite-seed-v1-([1-9][0-9]{0,9})-[A-Za-z0-9]{6}$/u;

export interface DesktopPgliteSeedReceipt {
  file: typeof DESKTOP_PGLITE_SEED_FILE;
  sha256: string;
  runtimeSha256: string;
}

export function validateDesktopPgliteSeedReceipt(
  value: unknown,
): DesktopPgliteSeedReceipt | undefined {
  if (value === undefined) return undefined;
  const receipt = value as Partial<DesktopPgliteSeedReceipt> | null;
  const sha256 = /^[a-f0-9]{64}$/u;
  if (
    receipt?.file !== DESKTOP_PGLITE_SEED_FILE ||
    typeof receipt.sha256 !== "string" ||
    !sha256.test(receipt.sha256) ||
    typeof receipt.runtimeSha256 !== "string" ||
    !sha256.test(receipt.runtimeSha256)
  ) {
    throw new Error("Invalid packaged PGlite seed receipt.");
  }
  return receipt as DesktopPgliteSeedReceipt;
}

/** Use the same SQL and PGlite package resolution as the packaged runtime. */
export function desktopPgliteRuntimeDigest(manifestPath: string): string {
  const sql = findPackageJSON(
    "@elizaos/plugin-sql",
    pathToFileURL(manifestPath),
  );
  const pglite =
    sql && findPackageJSON("@electric-sql/pglite", pathToFileURL(sql));
  if (!sql || !pglite) throw new Error("Packaged PGlite dependencies missing.");

  const root = realpathSync(dirname(manifestPath));
  const manifests = [sql, pglite].map((path) => realpathSync(path));
  for (const manifest of manifests) {
    const path = relative(root, manifest);
    if (
      !path ||
      isAbsolute(path) ||
      path === ".." ||
      path.startsWith(`..${sep}`)
    ) {
      throw new Error("PGlite dependencies are outside the packaged runtime.");
    }
  }

  // The manifests attest versions and the SQL package's pinned source build.
  return createHash("sha256")
    .update(readRegularFileSync(manifests[0], 256 * 1024))
    .update("\n")
    .update(readRegularFileSync(manifests[1], 256 * 1024))
    .digest("hex");
}

export function verifyDesktopPgliteSeed(
  manifestPath: string,
  receipt: DesktopPgliteSeedReceipt,
  archive: Uint8Array,
): void {
  if (
    archive[0] !== 0x1f ||
    archive[1] !== 0x8b ||
    createHash("sha256").update(archive).digest("hex") !== receipt.sha256 ||
    desktopPgliteRuntimeDigest(manifestPath) !== receipt.runtimeSha256
  ) {
    throw new Error("Packaged PGlite seed does not match its runtime receipt.");
  }
}

export async function archiveClosedPgliteDataDirectory(
  dataDir: string,
  archive: string,
): Promise<void> {
  const archiveModule = await import("./desktop-database-seed-archive");
  await archiveModule.archiveClosedPgliteDataDirectory(dataDir, archive);
}

async function pathIsMissing(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  }
}

function seedOwnerExited(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH";
  }
}

async function discardAbandonedSeeds(parent: string): Promise<void> {
  const entries = await readdir(parent, { withFileTypes: true }).catch(
    () => [],
  );
  for (const entry of entries) {
    const owner = entry.isDirectory() && STAGED_SEED.exec(entry.name);
    if (!owner || !seedOwnerExited(Number(owner[1]))) continue;

    const path = join(parent, entry.name);
    const stat = await lstat(path).catch(() => undefined);
    const uid = process.getuid?.();
    if (
      !stat?.isDirectory() ||
      (uid !== undefined && (stat.uid !== uid || (stat.mode & 0o077) !== 0))
    ) {
      continue;
    }
    await rm(path, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Unpack the signed, closed SDK database into a private sibling before use. */
export async function seedPgliteDataDirectory(
  dataDir: string,
  archive: Uint8Array,
): Promise<boolean> {
  if (!(await pathIsMissing(dataDir))) return false;
  if (
    archive.byteLength > MAX_PGLITE_SEED_BYTES ||
    archive[0] !== 0x1f ||
    archive[1] !== 0x8b
  ) {
    throw new Error("The PGlite seed must be a bounded gzip archive.");
  }

  const parent = dirname(dataDir);
  const [{ unpackClosedPgliteDataDirectory }] = await Promise.all([
    import("./desktop-database-seed-archive"),
    discardAbandonedSeeds(parent),
  ]);
  const staged = await mkdtemp(join(parent, `.pglite-seed-v1-${process.pid}-`));
  let published = false;
  try {
    await unpackClosedPgliteDataDirectory(staged, archive);

    if (!(await pathIsMissing(dataDir))) return false;
    // An initialized cluster or an SDK lock makes the destination non-empty.
    // Rename then fails atomically even if another startup raced the check.
    await rename(staged, dataDir);
    published = true;
    return true;
  } finally {
    if (!published) await rm(staged, { recursive: true, force: true });
  }
}

/** The distributed worker finds its signed asset alongside its runtime bundle. */
export async function seedPackagedDesktopPglite(
  runtimeDataDir: string,
  databaseDir: string,
): Promise<boolean> {
  const dataDir = resolve(runtimeDataDir, "pglite");
  if (
    resolve(databaseDir) !== dataDir ||
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.ELIZA_PGLITE_DISABLE_EXTENSIONS === "1" ||
    !(await pathIsMissing(dataDir))
  ) {
    return false;
  }

  try {
    const manifestPath = fileURLToPath(
      new URL("./runtime-manifest.json", import.meta.url),
    );
    const manifest: { pgliteSeed?: unknown } = JSON.parse(
      (await readRegularFile(manifestPath, 2 * 1024 * 1024)).toString("utf8"),
    );
    const receipt = validateDesktopPgliteSeedReceipt(manifest.pgliteSeed);
    if (!receipt) return false;
    const archive = await readRegularFile(
      join(dirname(manifestPath), receipt.file),
      MAX_PGLITE_SEED_BYTES,
    );
    verifyDesktopPgliteSeed(manifestPath, receipt, archive);
    return await seedPgliteDataDirectory(dataDir, archive);
  } catch {
    // This optimization is optional. The usual SDK startup owns recovery for
    // the actual profile database, which has not been opened by this attempt.
    return false;
  }
}
