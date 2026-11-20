import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readSync,
  writeFileSync,
} from "node:fs";

type FileIdentity = { dev: number; ino: number };
type ReadOptions = { singleLink?: boolean };

export class RegularFileError extends Error {
  constructor(readonly code: "not_regular" | "too_large" | "changed") {
    super(`Regular file inspection failed: ${code}.`);
    this.name = "RegularFileError";
  }
}

/** The caller owns the descriptor; reads start at byte zero without moving it. */
export function readRegularFileDescriptorSync(
  fd: number,
  maxBytes: number,
  expected?: FileIdentity,
  options?: ReadOptions,
): Buffer {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
    throw new RangeError("File read limit must be a nonnegative safe integer.");
  const before = fstatSync(fd);
  if (!before.isFile() || (options?.singleLink && before.nlink !== 1))
    throw new RegularFileError("not_regular");
  if (expected && (before.dev !== expected.dev || before.ino !== expected.ino))
    throw new RegularFileError("changed");
  if (!Number.isSafeInteger(before.size) || before.size > maxBytes)
    throw new RegularFileError("too_large");

  // The sentinel catches growth without allocating the full configured limit.
  const bytes = Buffer.alloc(before.size + 1);
  let length = 0;
  while (length < bytes.length) {
    const count = readSync(fd, bytes, length, bytes.length - length, length);
    if (count === 0) break;
    length += count;
  }
  const after = fstatSync(fd);
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
  return bytes.subarray(0, length);
}

/** Pin the final file entry. The caller is responsible for trusted ancestors. */
export function readRegularFileSync(
  path: string,
  maxBytes = 256 * 1024 * 1024,
  options?: ReadOptions,
): Buffer {
  const leaf = lstatSync(path);
  if (!leaf.isFile() || leaf.isSymbolicLink())
    throw new RegularFileError("not_regular");
  // Nonblocking open protects against a FIFO substituted after lstat.
  const fd = openSync(
    path,
    constants.O_RDONLY |
      (constants.O_NOFOLLOW ?? 0) |
      (constants.O_NONBLOCK ?? 0),
  );
  try {
    return readRegularFileDescriptorSync(fd, maxBytes, leaf, options);
  } finally {
    closeSync(fd);
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
