import {
  appendFileSync,
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";
import { writeJsonAtomicSync } from "@elizaos/agent/utils/atomic-json";

export function ensureGatewayJournalFile(pathname: string): void {
  const directory = dirname(pathname);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  let created = false;
  if (!existsSync(pathname)) {
    writeFileSync(pathname, "", { encoding: "utf8", mode: 0o600 });
    created = true;
  }
  chmodSync(pathname, 0o600);
  if (created && process.platform !== "win32") {
    // A file fsync does not necessarily make a newly-created directory entry
    // durable. Sync the journal directory before returning a provider receipt.
    // Windows does not support opening directories this way; NTFS persists the
    // newly-created file through the file handle's close path instead.
    const directoryDescriptor = openSync(directory, "r");
    try {
      fsyncSync(directoryDescriptor);
    } finally {
      closeSync(directoryDescriptor);
    }
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
  chmodSync(pathname, 0o600);
  return record;
}

/** Appends a single journal line only after it reached the backing device. */
export function appendGatewayJournalRecordDurably<T extends { at: string }>(
  pathname: string,
  record: T,
  io: GatewayJournalAppendIo = defaultGatewayJournalAppendIo,
): T {
  ensureGatewayJournalFile(pathname);
  const descriptor = io.open(pathname);
  try {
    const encoded = Buffer.from(`${JSON.stringify(record)}\n`, "utf8");
    let offset = 0;
    while (offset < encoded.length) {
      const written = io.write(
        descriptor,
        encoded,
        offset,
        encoded.length - offset,
      );
      if (!Number.isSafeInteger(written) || written <= 0) {
        throw new Error("Gateway journal append made no write progress.");
      }
      offset += written;
    }
    io.fsync(descriptor);
  } finally {
    io.close(descriptor);
  }
  chmodSync(pathname, 0o600);
  return record;
}

export interface GatewayJournalAppendIo {
  open(pathname: string): number;
  write(
    descriptor: number,
    buffer: Uint8Array,
    offset: number,
    length: number,
  ): number;
  fsync(descriptor: number): void;
  close(descriptor: number): void;
}

const defaultGatewayJournalAppendIo: GatewayJournalAppendIo = {
  open: (pathname) => openSync(pathname, "a", 0o600),
  write: (descriptor, buffer, offset, length) =>
    writeSync(descriptor, buffer, offset, length, null),
  fsync: fsyncSync,
  close: closeSync,
};

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
