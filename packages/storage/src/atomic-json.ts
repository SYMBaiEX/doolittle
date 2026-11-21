import { randomUUID } from "node:crypto";
import {
  closeSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

interface AtomicJsonWriteOptions {
  mode?: number;
  dirMode?: number;
  trailingNewline?: boolean;
  indent?: number;
}

/** Replace one private JSON file without ever publishing a partial write. */
export function writeJsonAtomicSync(
  path: string,
  value: unknown,
  options: AtomicJsonWriteOptions = {},
): void {
  if (!path.trim()) throw new TypeError("path must be a non-empty string");
  const body = JSON.stringify(value, null, options.indent ?? 2);
  if (body === undefined) throw new TypeError("Value is not JSON serializable");
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true, mode: options.dirMode ?? 0o700 });
  const temporary = join(parent, `.doolittle-write-${randomUUID()}.tmp`);
  const fd = openSync(temporary, "wx", options.mode ?? 0o600);
  try {
    try {
      writeFileSync(fd, options.trailingNewline ? `${body}\n` : body, "utf8");
    } finally {
      closeSync(fd);
    }
    renameSync(temporary, path);
  } catch (error) {
    try {
      rmSync(temporary, { force: true });
    } catch {
      // Preserve the write error. The temporary file remains private.
    }
    throw error;
  }
}
