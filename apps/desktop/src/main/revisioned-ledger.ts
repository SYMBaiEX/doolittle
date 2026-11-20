import { chmodSync } from "node:fs";
import { writeJsonAtomicSync } from "@elizaos/core";

export function readLedgerCopies<T extends { revision: number }>(
  path: string,
  backupPath: string,
  parse: (path: string) => T | null,
  label: string,
): T | null {
  let primary: T | null = null;
  let backup: T | null = null;
  let failure: unknown;
  try {
    primary = parse(path);
  } catch (error) {
    failure = error;
  }
  try {
    backup = parse(backupPath);
  } catch (error) {
    failure ??= error;
  }
  if (!primary && !backup && failure) {
    throw new Error(`Both ${label} copies are unavailable.`, {
      cause: failure,
    });
  }
  if (!primary) return backup;
  if (!backup) return primary;
  if (
    primary.revision === backup.revision &&
    JSON.stringify(primary) !== JSON.stringify(backup)
  ) {
    throw new Error(
      `${label.charAt(0).toUpperCase()}${label.slice(1)} copies disagree.`,
    );
  }
  return primary.revision >= backup.revision ? primary : backup;
}

export function writeLedgerCopy(path: string, value: unknown): void {
  writeJsonAtomicSync(path, value, { trailingNewline: true });
  chmodSync(path, 0o600);
}

export function writeLedgerCopies(
  path: string,
  backupPath: string,
  value: unknown,
): void {
  writeLedgerCopy(path, value);
  writeLedgerCopy(backupPath, value);
}
