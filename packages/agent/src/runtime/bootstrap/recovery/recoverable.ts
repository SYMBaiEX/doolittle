import { collectErrorMessages } from "./error-format";
import {
  hasMigrationsSchemaSignal,
  hasRecoverableSqlStartupSignal,
  hasRecoverableStorageSignal,
  hasRolodexStartupSignal,
  hasStorageContextSignal,
} from "./special-cases";

function isPgliteLockError(err: unknown): boolean {
  const haystack = collectErrorMessages(err).join("\n").toLowerCase();
  if (!haystack) {
    return false;
  }
  const hasLockSignal =
    haystack.includes("database is locked") ||
    haystack.includes("lock file already exists");
  return hasLockSignal && hasStorageContextSignal(haystack);
}

export function isRecoverablePgliteInitError(err: unknown): boolean {
  const haystack = collectErrorMessages(err).join("\n").toLowerCase();
  if (!haystack) {
    return false;
  }

  if (hasMigrationsSchemaSignal(haystack)) {
    return true;
  }

  if (
    haystack.includes("aborted(). build with -sassertions") &&
    haystack.includes("pglite")
  ) {
    return true;
  }

  const hasStorageContext = hasStorageContextSignal(haystack);
  if (!hasStorageContext) {
    return false;
  }

  return (
    hasRecoverableStorageSignal(haystack) ||
    hasRecoverableSqlStartupSignal(haystack) ||
    hasRolodexStartupSignal(haystack)
  );
}

export { isPgliteLockError };
