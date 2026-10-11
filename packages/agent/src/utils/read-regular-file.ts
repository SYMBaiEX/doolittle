import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";

/** Pin the final file entry and bound reads even if the file grows after stat.
 * Ancestor directories must remain within the caller's trusted storage root.
 */
export function readRegularFileSync(path: string, maxBytes: number): Buffer {
  assertReadLimit(maxBytes);
  const descriptor = openSync(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | constants.O_NONBLOCK,
  );
  try {
    return readRegularFileDescriptorSync(descriptor, maxBytes);
  } finally {
    closeSync(descriptor);
  }
}

/** The caller retains ownership; descriptor must be positioned at file start. */
export function readRegularFileDescriptorSync(
  descriptor: number,
  maxBytes: number,
): Buffer {
  assertReadLimit(maxBytes);
  const info = fstatSync(descriptor);
  if (!info.isFile() || info.size > maxBytes) {
    throw new Error("File is not a bounded regular file.");
  }
  // One sentinel byte detects growth without allocating the caller's full cap.
  const bytes = Buffer.alloc(info.size + 1);
  let length = 0;
  while (length < bytes.length) {
    const count = readSync(
      descriptor,
      bytes,
      length,
      bytes.length - length,
      null,
    );
    if (count === 0) break;
    length += count;
  }
  if (length > info.size) throw new Error("File grew during the bounded read.");
  if (length !== info.size)
    throw new Error("File shrank during the bounded read.");
  const after = fstatSync(descriptor);
  if (
    after.size !== info.size ||
    after.mtimeMs !== info.mtimeMs ||
    after.ctimeMs !== info.ctimeMs
  ) {
    throw new Error("File changed during the bounded read.");
  }
  return bytes.subarray(0, length);
}

function assertReadLimit(maxBytes: number): void {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 0 ||
    maxBytes >= Number.MAX_SAFE_INTEGER
  ) {
    throw new Error("File read limit must be a nonnegative safe integer.");
  }
}
