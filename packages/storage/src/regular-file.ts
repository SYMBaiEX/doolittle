import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readSync,
  type Stats,
  writeFileSync,
} from "node:fs";
import { lstat, open } from "node:fs/promises";

type FileIdentity = { dev: number; ino: number };
type ReadOptions = { singleLink?: boolean };
type AsyncReadOptions = ReadOptions & { signal?: AbortSignal };

const DEFAULT_MAX_BYTES = 256 * 1024 * 1024;
const ASYNC_READ_CHUNK_BYTES = 1024 * 1024;
// Nonblocking open protects against a FIFO substituted after lstat.
const READ_FLAGS =
  constants.O_RDONLY |
  (constants.O_NOFOLLOW ?? 0) |
  (constants.O_NONBLOCK ?? 0);

export class RegularFileError extends Error {
  constructor(readonly code: "not_regular" | "too_large" | "changed") {
    super(`Regular file inspection failed: ${code}.`);
    this.name = "RegularFileError";
  }
}

function validateReadLimit(maxBytes: number): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
    throw new RangeError("File read limit must be a nonnegative safe integer.");
}

function validateFileForRead(
  before: Stats,
  maxBytes: number,
  expected?: FileIdentity,
  options?: ReadOptions,
): void {
  if (!before.isFile() || (options?.singleLink && before.nlink !== 1))
    throw new RegularFileError("not_regular");
  if (expected && (before.dev !== expected.dev || before.ino !== expected.ino))
    throw new RegularFileError("changed");
  if (!Number.isSafeInteger(before.size) || before.size > maxBytes)
    throw new RegularFileError("too_large");
}

function validateFileAfterRead(
  length: number,
  before: Stats,
  after: Stats,
  options?: ReadOptions,
): void {
  if (
    length !== before.size ||
    after.size !== before.size ||
    after.dev !== before.dev ||
    after.ino !== before.ino ||
    after.mtimeMs !== before.mtimeMs ||
    after.ctimeMs !== before.ctimeMs ||
    (options?.singleLink && after.nlink !== 1)
  )
    throw new RegularFileError("changed");
}

/** The caller owns the descriptor; reads start at byte zero without moving it. */
export function readRegularFileDescriptorSync(
  fd: number,
  maxBytes: number,
  expected?: FileIdentity,
  options?: ReadOptions,
): Buffer {
  validateReadLimit(maxBytes);
  const before = fstatSync(fd);
  validateFileForRead(before, maxBytes, expected, options);

  // The sentinel catches growth without allocating the full configured limit.
  const bytes = Buffer.alloc(before.size + 1);
  let length = 0;
  while (length < bytes.length) {
    const count = readSync(fd, bytes, length, bytes.length - length, length);
    if (count === 0) break;
    length += count;
  }
  validateFileAfterRead(length, before, fstatSync(fd), options);
  return bytes.subarray(0, length);
}

/** Pin the final file entry. The caller is responsible for trusted ancestors. */
export function readRegularFileSync(
  path: string,
  maxBytes = DEFAULT_MAX_BYTES,
  options?: ReadOptions,
): Buffer {
  const leaf = lstatSync(path);
  if (!leaf.isFile() || leaf.isSymbolicLink())
    throw new RegularFileError("not_regular");
  const fd = openSync(path, READ_FLAGS);
  try {
    return readRegularFileDescriptorSync(fd, maxBytes, leaf, options);
  } finally {
    closeSync(fd);
  }
}

/** Pin the final file entry, yielding between reads for cancellation and I/O. */
export async function readRegularFile(
  path: string,
  maxBytes = DEFAULT_MAX_BYTES,
  options?: AsyncReadOptions,
): Promise<Buffer<ArrayBuffer>> {
  const signal = options?.signal;
  signal?.throwIfAborted();
  validateReadLimit(maxBytes);
  const leaf = await lstat(path);
  if (!leaf.isFile() || leaf.isSymbolicLink())
    throw new RegularFileError("not_regular");
  signal?.throwIfAborted();
  const file = await open(path, READ_FLAGS);
  try {
    signal?.throwIfAborted();
    const before = await file.stat();
    validateFileForRead(before, maxBytes, leaf, options);
    // The returned view excludes the sentinel, but shares its backing buffer.
    const bytes = Buffer.allocUnsafeSlow(before.size + 1);
    bytes[before.size] = 0;
    let length = 0;
    while (length < bytes.length) {
      signal?.throwIfAborted();
      const { bytesRead } = await file.read(
        bytes,
        length,
        Math.min(ASYNC_READ_CHUNK_BYTES, bytes.length - length),
        length,
      );
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    signal?.throwIfAborted();
    validateFileAfterRead(length, before, await file.stat(), options);
    return bytes.subarray(0, length);
  } finally {
    await file.close();
    signal?.throwIfAborted();
  }
}

/** Exclusive creation, readback and fsync all use the same private inode. */
export function writeVerifiedFileSync(path: string, bytes: Buffer): void {
  const fd = openSync(path, "wx+", 0o600);
  try {
    writeFileSync(fd, bytes);
    if (!readRegularFileDescriptorSync(fd, bytes.byteLength).equals(bytes))
      throw new RegularFileError("changed");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
