import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { readRegularFileSync } from "../../../utils/read-regular-file";

// Bundles may contain many records; these caps bound a single synchronous read.
export const MAX_TRAJECTORY_MANIFEST_BYTES = 1024 * 1024;
export const MAX_TRAJECTORY_RECORD_BYTES = 32 * 1024 * 1024;

export class TrajectoryInputError extends Error {
  readonly status = 400;

  constructor() {
    super("Invalid trajectory artifact.");
  }
}

/** Keep the operator-selected root (including a symlinked root) and reject
 * descendant symlinks observed during validation. The bounded reader pins the
 * final regular file with NOFOLLOW; ancestor directories must remain stable
 * between validation and open (Node does not expose openat-style dirfd walks).
 */
export function resolveOwnedTrajectoryFile(
  baseDir: string,
  input: string,
): string {
  if (typeof input !== "string" || !input || input.includes("\0")) {
    throw new TrajectoryInputError();
  }
  try {
    const root = resolve(baseDir);
    const path = isAbsolute(input) ? resolve(input) : resolve(root, input);
    const canonicalRoot = realpathSync(root);
    const lexicalPart = relative(root, path);
    const rootForWalk =
      lexicalPart &&
      lexicalPart !== ".." &&
      !lexicalPart.startsWith(`..${sep}`) &&
      !isAbsolute(lexicalPart)
        ? root
        : canonicalRoot;
    const part = relative(rootForWalk, path);
    if (
      !part ||
      part === ".." ||
      part.startsWith(`..${sep}`) ||
      isAbsolute(part)
    ) {
      throw new TrajectoryInputError();
    }
    let cursor = rootForWalk;
    for (const segment of part.split(sep)) {
      cursor = join(cursor, segment);
      if (lstatSync(cursor).isSymbolicLink()) throw new TrajectoryInputError();
    }
    const canonicalFile = realpathSync(path);
    const canonicalPart = relative(canonicalRoot, canonicalFile);
    if (
      !canonicalPart ||
      canonicalPart === ".." ||
      canonicalPart.startsWith(`..${sep}`) ||
      isAbsolute(canonicalPart)
    ) {
      throw new TrajectoryInputError();
    }
    return path;
  } catch {
    throw new TrajectoryInputError();
  }
}

export function readOwnedTrajectoryFile(
  baseDir: string,
  input: string,
  maxBytes: number,
): string {
  const path = resolveOwnedTrajectoryFile(baseDir, input);
  try {
    return readRegularFileSync(path, maxBytes).toString("utf8");
  } catch {
    throw new TrajectoryInputError();
  }
}
