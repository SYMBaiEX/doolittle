import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import { create, extract } from "tar";

const MAX_UNPACKED_SEED_BYTES = 64 * 1024 * 1024;
const MAX_SEED_ENTRIES = 2_048;
const SEED_PATH = /^(?:[A-Za-z0-9_][A-Za-z0-9_.-]*(?:\/|$))+$/u;
const RUNTIME_FILES = new Set([
  "eliza-pglite.lock",
  "postmaster.opts",
  "postmaster.pid",
]);
const gunzipSeed = promisify(gunzip);

/** Package the file-backed cluster only after the SDK adapter is closed. */
export async function archiveClosedPgliteDataDirectory(
  dataDir: string,
  archive: string,
): Promise<void> {
  await create(
    {
      cwd: dataDir,
      file: archive,
      gzip: true,
      noMtime: true,
      portable: true,
      strict: true,
    },
    (await readdir(dataDir)).sort(),
  );
}

export async function unpackClosedPgliteDataDirectory(
  staged: string,
  archive: Uint8Array,
): Promise<void> {
  const paths = new Set<string>();
  let totalBytes = 0;
  let rejected = false;
  const contents = await gunzipSeed(archive, {
    maxOutputLength: MAX_UNPACKED_SEED_BYTES,
  });
  // The first tar path is a file name, never nested compression.
  if (!/^[A-Za-z0-9_]/u.test(contents.subarray(0, 1).toString("latin1"))) {
    throw new Error("The PGlite seed does not contain a closed database.");
  }
  // Finish writes before proceeding or removing a failed staging directory.
  const unpack = extract({
    cwd: staged,
    keep: true,
    maxDepth: 4,
    noMtime: true,
    preserveOwner: false,
    strict: true,
    sync: true,
    filter: (path, entry) => {
      const key = path.replace(/\/$/u, "").toLowerCase();
      if (
        !("type" in entry) ||
        !SEED_PATH.test(path) ||
        RUNTIME_FILES.has(key) ||
        paths.has(key) ||
        (entry.type !== "File" && entry.type !== "Directory") ||
        !Number.isSafeInteger(entry.size) ||
        entry.size < 0 ||
        paths.size >= MAX_SEED_ENTRIES ||
        totalBytes + entry.size > MAX_UNPACKED_SEED_BYTES
      ) {
        rejected = true;
        return false;
      }
      paths.add(key);
      totalBytes += entry.size;
      return true;
    },
  });
  unpack.end(contents);
  if (
    rejected ||
    !(await lstat(join(staged, "PG_VERSION"))).isFile() ||
    !(await lstat(join(staged, "global", "pg_control"))).isFile()
  ) {
    throw new Error("The PGlite seed does not contain a closed database.");
  }
}
