import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

export interface PrivateReportDirectory {
  readonly path: string;
  readonly dev: bigint;
  readonly ino: bigint;
}

function refused(): never {
  throw new Error("Headless report storage is not an owned private directory.");
}

function uid(): bigint {
  if (!process.getuid || !constants.O_NOFOLLOW || !constants.O_DIRECTORY)
    return refused();
  return BigInt(process.getuid());
}

function ensureDirectory(path: string): void {
  try {
    const stat = lstatSync(path, { bigint: true });
    if (stat.isSymbolicLink()) {
      // Permit system-owned aliases such as macOS /var, not user aliases.
      if (stat.uid !== 0n) refused();
      return;
    }
    if (!stat.isDirectory()) refused();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") refused();
    const parent = dirname(path);
    if (parent === path) refused();
    ensureDirectory(parent);
    validateAncestry(realpathSync(parent));
    mkdirSync(path, { mode: 0o700 });
  }
}

function validateAncestry(path: string): void {
  const owner = uid();
  let current = path;
  while (true) {
    const stat = lstatSync(current, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) refused();
    if (stat.uid !== owner && stat.uid !== 0n) refused();
    // Shared writable parents are permitted only with sticky protection.
    if ((stat.mode & 0o022n) !== 0n && (stat.mode & 0o1000n) === 0n) refused();
    if (dirname(current) === current) break;
    current = dirname(current);
  }
}

export function verifyPrivateReportDirectory(
  directory: PrivateReportDirectory,
): void {
  try {
    const stat = lstatSync(directory.path, { bigint: true });
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== uid() ||
      (stat.mode & 0o777n) !== 0o700n ||
      stat.dev !== directory.dev ||
      stat.ino !== directory.ino ||
      realpathSync(directory.path) !== directory.path
    )
      refused();
    validateAncestry(directory.path);
  } catch {
    refused();
  }
}

/** Operator paths remain allowed; relative XDG values are ignored per XDG. */
export function privateReportStateRoot(
  stateHome: string | undefined,
  home: string,
): string {
  const state = stateHome?.trim();
  return state && isAbsolute(state)
    ? resolve(state)
    : join(home, ".local", "state");
}

export function preparePrivateReportDirectory(
  explicit?: string,
): PrivateReportDirectory {
  try {
    uid();
    const base = privateReportStateRoot(process.env.XDG_STATE_HOME, homedir());
    const requested = explicit?.trim()
      ? resolve(explicit)
      : resolve(base, "doolittle", "evals", "headless");
    // Check existing spelling components before canonicalizing. No chmod.
    let component = requested;
    while (true) {
      ensureDirectory(component);
      if (dirname(component) === component) break;
      component = dirname(component);
    }
    if (lstatSync(requested, { bigint: true }).isSymbolicLink()) refused();
    const path = realpathSync(requested);
    if (!explicit?.trim()) {
      const canonicalBase = realpathSync(base);
      if (path !== resolve(canonicalBase, "doolittle", "evals", "headless"))
        refused();
    }
    const stat = lstatSync(path, { bigint: true });
    const directory = { path, dev: stat.dev, ino: stat.ino };
    verifyPrivateReportDirectory(directory);
    return directory;
  } catch {
    refused();
  }
}

export function privateReportFilename(
  createdAt: string,
  suiteId: string,
  version: number,
): string {
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(suiteId) ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(createdAt)
  )
    throw new Error(
      "Headless report identity must be safe filename components.",
    );
  return `${createdAt.replaceAll(/[:.]/g, "-")}-${suiteId}-v${version}-${randomUUID()}.json`;
}

export function privateReportPath(
  directory: PrivateReportDirectory,
  leaf: string,
): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,255}$/.test(leaf)) refused();
  const path = resolve(directory.path, leaf);
  if (dirname(path) !== directory.path || basename(path) !== leaf) refused();
  return path;
}

/** Quiescent owned directories, not an openat/race-proof ancestor guarantee. */
export function writePrivateReportFile(
  directory: PrivateReportDirectory,
  leaf: string,
  bytes: string,
): void {
  let directoryFd: number | undefined;
  let fd: number | undefined;
  let failed = false;
  try {
    directoryFd = openSync(
      directory.path,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    const parent = fstatSync(directoryFd, { bigint: true });
    if (parent.dev !== directory.dev || parent.ino !== directory.ino) refused();
    verifyPrivateReportDirectory(directory);
    fd = openSync(
      privateReportPath(directory, leaf),
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    const file = fstatSync(fd, { bigint: true });
    if (!file.isFile() || file.uid !== uid() || (file.mode & 0o777n) !== 0o600n)
      refused();
    verifyPrivateReportDirectory(directory);
    writeFileSync(fd, bytes);
  } catch {
    failed = true;
  } finally {
    try {
      if (fd !== undefined) closeSync(fd);
    } catch {
      failed = true;
    } finally {
      try {
        if (directoryFd !== undefined) closeSync(directoryFd);
      } catch {
        failed = true;
      }
    }
  }
  if (failed) throw new Error("Headless private report write failed.");
}
