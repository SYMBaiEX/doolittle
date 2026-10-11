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

export class RegularFileError extends Error {
  constructor(readonly code: "not_regular" | "too_large" | "changed") {
    super(`Regular file inspection failed: ${code}.`);
  }
}

/** Validate and read the opened object, never a separately checked pathname. */
export function readRegularFileDescriptor(
  fd: number,
  maxBytes: number,
): Buffer {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
    throw new RangeError("Invalid regular file byte limit.");
  const before = fstatSync(fd);
  if (!before.isFile()) throw new RegularFileError("not_regular");
  if (!Number.isSafeInteger(before.size) || before.size > maxBytes)
    throw new RegularFileError("too_large");
  // One extra byte detects growth without an unbounded readFileSync allocation.
  const bytes = Buffer.alloc(before.size + 1);
  let length = 0;
  while (length < bytes.byteLength) {
    const count = readSync(
      fd,
      bytes,
      length,
      bytes.byteLength - length,
      length,
    );
    if (count === 0) break;
    length += count;
  }
  const after = fstatSync(fd);
  if (
    length !== before.size ||
    after.size !== before.size ||
    after.mtimeMs !== before.mtimeMs ||
    after.ctimeMs !== before.ctimeMs
  )
    throw new RegularFileError("changed");
  return bytes.subarray(0, length);
}

/** O_NONBLOCK prevents a substituted FIFO from blocking before fstat rejects it. */
export function readBoundedRegularFile(path: string, maxBytes: number): Buffer {
  const fd = openSync(
    path,
    constants.O_RDONLY |
      (constants.O_NOFOLLOW ?? 0) |
      (constants.O_NONBLOCK ?? 0),
  );
  try {
    // Platforms without O_NOFOLLOW still reject visible final-component links.
    // Neither this nor O_NOFOLLOW pins mutable ancestor directories.
    if (!constants.O_NOFOLLOW && lstatSync(path).isSymbolicLink())
      throw new RegularFileError("not_regular");
    return readRegularFileDescriptor(fd, maxBytes);
  } finally {
    closeSync(fd);
  }
}

/** Exclusive creation, verification and fsync all use the same private inode. */
export function writeVerifiedFileSync(path: string, bytes: Buffer): void {
  const fd = openSync(path, "wx+", 0o600);
  try {
    writeFileSync(fd, bytes);
    if (!readRegularFileDescriptor(fd, bytes.byteLength).equals(bytes))
      throw new RegularFileError("changed");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
