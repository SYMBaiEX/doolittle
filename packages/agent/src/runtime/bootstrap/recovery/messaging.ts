import { formatError } from "./error-format";
import type { PgliteRecoveryAction } from "./types";

export function createActivePgliteLockError(
  dataDir: string,
  err: unknown,
): Error {
  return new Error(
    `PGLite data dir is already in use at ${dataDir}. Close the other Doolittle process or set a different PGLITE_DATA_DIR before retrying.`,
    { cause: err },
  );
}

export function createPgliteRecoveryMessage(
  action: Extract<
    PgliteRecoveryAction,
    "retry-without-reset" | "reset-data-dir"
  >,
  dataDir: string,
  err: unknown,
): string {
  const recoveryDetail =
    action === "retry-without-reset"
      ? `Cleared a stale lock in ${dataDir} and retrying once.`
      : `Resetting local DB at ${dataDir} and retrying once.`;
  return `[doolittle] PGLite startup failed (${formatError(err)}). ${recoveryDetail}`;
}

export function createPgliteRetryFailureError(
  dataDir: string,
  retryErr: unknown,
): Error {
  return new Error(
    `PGLite startup failed after automatic recovery at ${dataDir}: ${formatError(retryErr)}. Run \`doolittle doctor\` or remove the local DB directory if it is still corrupted.`,
    { cause: retryErr },
  );
}
