import { reconcilePglitePidFile } from "./pid-file";
import { isPgliteLockError, isRecoverablePgliteInitError } from "./recoverable";
import type { PgliteRecoveryAction } from "./types";

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
