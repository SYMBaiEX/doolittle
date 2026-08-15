import {
  appendFileSync,
  chmodSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { writeJsonAtomicSync } from "@elizaos/agent/utils/atomic-json";

export function ensureGatewayJournalFile(pathname: string): void {
  chmodSync(dirname(pathname), 0o700);
  if (!existsSync(pathname)) {
    writeFileSync(pathname, "", { encoding: "utf8", mode: 0o600 });
  }
  chmodSync(pathname, 0o600);
}

export function loadGatewayJournal<T>(pathname: string): T[] {
  if (!existsSync(pathname)) {
    return [];
  }

  const raw = readFileSync(pathname, "utf8").trim();
  if (!raw) {
    return [];
  }

  return raw
    .split("\n")
    .map((line) => {
      try {
        return JSON.parse(line) as T;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is T => Boolean(entry));
}

export function appendGatewayJournalRecord<T extends { at: string }>(
  pathname: string,
  record: T,
): T {
  appendFileSync(pathname, `${JSON.stringify(record)}\n`, "utf8");
  chmodSync(pathname, 0o600);
  return record;
}

export function persistGatewaySnapshotFiles<
  TSnapshot extends object,
  THistoryEntry extends object,
>(options: {
  snapshotPath: string;
  historyPath: string;
  snapshot: TSnapshot;
  historyEntry: THistoryEntry;
  persistedAt?: string;
}): string {
  const persistedAt = options.persistedAt ?? new Date().toISOString();
  writeJsonAtomicSync(options.snapshotPath, {
    persistedAt,
    ...options.snapshot,
  });
  appendFileSync(
    options.historyPath,
    `${JSON.stringify({
      persistedAt,
      ...options.historyEntry,
    })}\n`,
    "utf8",
  );
  chmodSync(dirname(options.snapshotPath), 0o700);
  chmodSync(options.snapshotPath, 0o600);
  chmodSync(options.historyPath, 0o600);
  return persistedAt;
}
