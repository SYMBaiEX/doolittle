import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

export function ensureGatewayJournalFile(pathname: string): void {
  if (!existsSync(pathname)) {
    writeFileSync(pathname, "", "utf8");
  }
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
  writeFileSync(
    options.snapshotPath,
    JSON.stringify(
      {
        persistedAt,
        ...options.snapshot,
      },
      null,
      2,
    ),
    "utf8",
  );
  appendFileSync(
    options.historyPath,
    `${JSON.stringify({
      persistedAt,
      ...options.historyEntry,
    })}\n`,
    "utf8",
  );
  return persistedAt;
}
