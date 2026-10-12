import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
} from "node:fs";

/** Prepare a dedicated application-owned child directory without chmodding its parent. */
export function ensurePrivateDirectorySync(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const before = lstatSync(path);
  if (!before.isDirectory() || before.isSymbolicLink()) {
    throw new Error("Private storage directory must be a real directory.");
  }
  const descriptor = openSync(
    path,
    constants.O_RDONLY |
      constants.O_NONBLOCK |
      (constants.O_DIRECTORY ?? 0) |
      (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const info = fstatSync(descriptor);
    if (
      !info.isDirectory() ||
      info.dev !== before.dev ||
      info.ino !== before.ino
    ) {
      throw new Error("Private storage directory changed before use.");
    }
    if (typeof process.getuid === "function" && info.uid !== process.getuid()) {
      throw new Error("Private storage directory is not owned by this user.");
    }
    if ((info.mode & 0o777) !== 0o700) fchmodSync(descriptor, 0o700);
  } finally {
    closeSync(descriptor);
  }
}
