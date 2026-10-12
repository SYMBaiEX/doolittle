import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
} from "node:fs";

/** Read a release input from one regular-file descriptor, never a final symlink. */
export function readRegularFile(
  path: string,
  maxBytes = 256 * 1024 * 1024,
): Buffer {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new Error(
      "Desktop input read limit must be a nonnegative safe integer.",
    );
  }
  const leaf = lstatSync(path);
  if (!leaf.isFile() || leaf.isSymbolicLink()) {
    throw new Error(`Desktop input is not a regular file: ${path}`);
  }
  const fd = openSync(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | constants.O_NONBLOCK,
  );
  try {
    const before = fstatSync(fd);
    if (
      !before.isFile() ||
      before.size > maxBytes ||
      before.dev !== leaf.dev ||
      before.ino !== leaf.ino
    ) {
      throw new Error(`Desktop input is not a bounded regular file: ${path}`);
    }
    const bytes = Buffer.alloc(before.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(fd, bytes, length, bytes.length - length, null);
      if (count === 0) break;
      length += count;
    }
    if (length !== before.size) {
      throw new Error(`Desktop input changed while reading: ${path}`);
    }
    const after = fstatSync(fd);
    if (
      after.size !== before.size ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    ) {
      throw new Error(`Desktop input changed while reading: ${path}`);
    }
    return bytes.subarray(0, length);
  } finally {
    closeSync(fd);
  }
}
