import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";

export type PgliteRecoveryAction =
  | "none"
  | "retry-without-reset"
  | "reset-data-dir"
  | "fail-active-lock";

export type PglitePidFileStatus =
  | "missing"
  | "active"
  | "active-unconfirmed"
  | "cleared-stale"
  | "cleared-malformed"
  | "check-failed";

function collectErrorMessages(err: unknown): string[] {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = err;

  while (current && !seen.has(current)) {
    seen.add(current);
    if (typeof current === "string") {
      messages.push(current);
      break;
    }
    if (current instanceof Error) {
      if (current.message) {
        messages.push(current.message);
      }
      if (current.stack) {
        messages.push(current.stack);
      }
      current = (current as Error & { cause?: unknown }).cause;
      continue;
    }
    if (typeof current === "object") {
      const maybeError = current as { message?: unknown; cause?: unknown };
      if (typeof maybeError.message === "string" && maybeError.message) {
        messages.push(maybeError.message);
      }
      if (maybeError.cause !== undefined) {
        current = maybeError.cause;
        continue;
      }
    }
    break;
  }

  return messages;
}

export function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.message || String(err);
  }
  if (typeof err === "string") {
    return err;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function isPgliteLockError(err: unknown): boolean {
  const haystack = collectErrorMessages(err).join("\n").toLowerCase();
  if (!haystack) {
    return false;
  }
  const hasPglite = haystack.includes("pglite");
  const hasSqlite = haystack.includes("sqlite");
  const hasLockSignal =
    haystack.includes("database is locked") ||
    haystack.includes("lock file already exists");
  return hasLockSignal && (hasPglite || hasSqlite);
}

export function isRecoverablePgliteInitError(err: unknown): boolean {
  const haystack = collectErrorMessages(err).join("\n").toLowerCase();
  if (!haystack) {
    return false;
  }
  const hasAbort = haystack.includes("aborted(). build with -sassertions");
  const hasPglite = haystack.includes("pglite");
  const hasSqlite = haystack.includes("sqlite");
  const hasSqlPlugin =
    haystack.includes("plugin:sql") ||
    haystack.includes("database adapter") ||
    haystack.includes("migrator");
  const hasMigrationsSchema =
    haystack.includes("create schema if not exists migrations") ||
    haystack.includes("failed query: create schema if not exists migrations");
  const hasRecoverableStorageSignal = [
    "database disk image is malformed",
    "file is not a database",
    "malformed database schema",
    "database is locked",
    "lock file already exists",
    "wal file",
    "checkpoint failed",
    "checksum mismatch",
    "corrupt",
  ].some((needle) => haystack.includes(needle));
  const hasRecoverableStartupSignal = [
    "pglite recovery failed for",
    "pglite initialization failed",
    "[followupservice] rolodexservice is not available",
    "service rolodex not found or failed to start",
    "service follow_up not found or failed to start",
    "[rolodexservice] failed to ensure rolodex world",
    "database adapter not initialized",
    "database or migrator not initialized in databasemigrationservice",
  ].some((needle) => haystack.includes(needle));
  const hasStorageContext = hasPglite || hasSqlite || hasSqlPlugin;

  if (hasMigrationsSchema) return true;
  if (hasAbort && hasPglite) return true;
  if (hasRecoverableStorageSignal && hasStorageContext) return true;
  if (hasRecoverableStartupSignal && hasStorageContext) return true;
  return false;
}

export function reconcilePglitePidFile(dataDir: string): PglitePidFileStatus {
  const pidPath = join(dataDir, "postmaster.pid");
  if (!existsSync(pidPath)) {
    return "missing";
  }

  try {
    const content = readFileSync(pidPath, "utf-8");
    const firstLine = content.split("\n")[0]?.trim();
    const pid = Number.parseInt(firstLine ?? "", 10);
    if (Number.isNaN(pid) || pid <= 0) {
      unlinkSync(pidPath);
      return "cleared-malformed";
    }

    try {
      process.kill(pid, 0);
      return "active";
    } catch (killErr: unknown) {
      const code = (killErr as NodeJS.ErrnoException).code;
      if (code === "ESRCH") {
        unlinkSync(pidPath);
        return "cleared-stale";
      }
      return "active-unconfirmed";
    }
  } catch {
    return "check-failed";
  }
}

export function getPgliteRecoveryAction(
  err: unknown,
  dataDir: string,
): PgliteRecoveryAction {
  if (!isRecoverablePgliteInitError(err)) {
    return "none";
  }
  if (!isPgliteLockError(err)) {
    return "reset-data-dir";
  }
  const pidStatus = reconcilePglitePidFile(dataDir);
  if (
    pidStatus === "active" ||
    pidStatus === "active-unconfirmed" ||
    pidStatus === "check-failed"
  ) {
    return "fail-active-lock";
  }
  if (pidStatus === "cleared-stale" || pidStatus === "cleared-malformed") {
    return "retry-without-reset";
  }
  return "reset-data-dir";
}

export async function resetPgliteDataDir(dataDir: string): Promise<void> {
  const normalized = dataDir;
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..*$/, "")
    .replace("T", "-");
  const backupDir = `${normalized}.corrupt-${stamp}`;
  if (existsSync(normalized)) {
    try {
      renameSync(normalized, backupDir);
    } catch {
      rmSync(normalized, { recursive: true, force: true });
    }
  }
  mkdirSync(normalized, { recursive: true });
}

export async function resetPluginSqlPgliteSingleton(): Promise<void> {
  const singletonKey = Symbol.for("@elizaos/plugin-sql/global-singletons");
  const singletons = (
    globalThis as typeof globalThis & {
      [key: symbol]: {
        pgLiteClientManager?: { close?: () => Promise<void> | void };
      };
    }
  )[singletonKey];

  if (!singletons?.pgLiteClientManager) {
    return;
  }

  try {
    await singletons.pgLiteClientManager.close?.();
  } catch {
    // Best effort only. We'll still drop the singleton reference below.
  }

  delete singletons.pgLiteClientManager;
}

export function createActivePgliteLockError(
  dataDir: string,
  err: unknown,
): Error {
  return new Error(
    `PGLite data dir is already in use at ${dataDir}. Close the other Doolittle process or set a different PGLITE_DATA_DIR before retrying.`,
    { cause: err },
  );
}
