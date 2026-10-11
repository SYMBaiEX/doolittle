import {
  appendFileSync,
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";
import { writeJsonAtomicSync } from "@elizaos/agent/utils/atomic-json";

export function ensureGatewayJournalFile(pathname: string): void {
  const directory = dirname(pathname);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  let created = false;
  let descriptor: number;
  try {
    descriptor = openSync(
      pathname,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
      0o600,
    );
    created = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    descriptor = openJournalAppend(pathname);
  }
  try {
    if (!fstatSync(descriptor).isFile())
      throw new Error("Journal is not a regular file.");
    fchmodSync(descriptor, 0o600);
  } finally {
    closeSync(descriptor);
  }
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
  ensureGatewayJournalFile(pathname);
  const descriptor = openJournalAppend(pathname);
  try {
    appendFileSync(descriptor, `${JSON.stringify(record)}\n`, "utf8");
  } finally {
    closeSync(descriptor);
  }
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
  open: openJournalAppend,
  write: (descriptor, buffer, offset, length) =>
    writeSync(descriptor, buffer, offset, length, null),
  fsync: fsyncSync,
  close: closeSync,
};

function openJournalAppend(pathname: string): number {
  const descriptor = openSync(
    pathname,
    constants.O_WRONLY |
      constants.O_APPEND |
      (constants.O_NOFOLLOW ?? 0) |
      constants.O_NONBLOCK,
  );
  try {
    if (!fstatSync(descriptor).isFile())
      throw new Error("Journal is not a regular file.");
    fchmodSync(descriptor, 0o600);
    return descriptor;
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
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
  ensureGatewayJournalFile(options.historyPath);
  const descriptor = openJournalAppend(options.historyPath);
  try {
    appendFileSync(
      descriptor,
      `${JSON.stringify({
        persistedAt,
        ...options.historyEntry,
      })}\n`,
      "utf8",
    );
  } finally {
    closeSync(descriptor);
  }
  chmodSync(dirname(options.snapshotPath), 0o700);
  chmodSync(options.snapshotPath, 0o600);
  return persistedAt;
}
