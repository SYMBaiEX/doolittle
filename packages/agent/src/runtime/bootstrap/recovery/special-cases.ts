const recoverableStorageSignals = [
  "database disk image is malformed",
  "file is not a database",
  "malformed database schema",
  "database is locked",
  "lock file already exists",
  "wal file",
  "checkpoint failed",
  "checksum mismatch",
  "corrupt",
];

const recoverableSqlStartupSignals = [
  "pglite recovery failed for",
  "pglite initialization failed",
  "database adapter not initialized",
  "database or migrator not initialized in databasemigrationservice",
];

const rolodexStartupSignals = [
  "[followupservice] rolodexservice is not available",
  "service rolodex not found or failed to start",
  "service follow_up not found or failed to start",
  "[rolodexservice] failed to ensure rolodex world",
];

export function hasStorageContextSignal(haystack: string): boolean {
  return (
    haystack.includes("pglite") ||
    haystack.includes("sqlite") ||
    haystack.includes("plugin:sql") ||
    haystack.includes("database adapter") ||
    haystack.includes("migrator")
  );
}

export function hasMigrationsSchemaSignal(haystack: string): boolean {
  return (
    haystack.includes("create schema if not exists migrations") ||
    haystack.includes("failed query: create schema if not exists migrations")
  );
}

export function hasRecoverableStorageSignal(haystack: string): boolean {
  return recoverableStorageSignals.some((needle) => haystack.includes(needle));
}

export function hasRecoverableSqlStartupSignal(haystack: string): boolean {
  return recoverableSqlStartupSignals.some((needle) =>
    haystack.includes(needle),
  );
}

export function hasRolodexStartupSignal(haystack: string): boolean {
  return rolodexStartupSignals.some((needle) => haystack.includes(needle));
}
