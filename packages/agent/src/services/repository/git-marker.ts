import { lstatSync } from "node:fs";
import { readRegularFileSync } from "@/utils/read-regular-file";

// Git's linked-worktree marker is one short line. Bound it before decoding.
export const MAX_GIT_MARKER_BYTES = 4_096;

/** Return null for a normal .git directory, or the gitdir path in a marker. */
export function readGitMarker(marker: string): string | null {
  const entry = lstatSync(marker);
  if (entry.isDirectory()) return null;
  if (!entry.isFile() || entry.isSymbolicLink())
    throw new Error("Git marker is not a regular file or directory.");

  const contents = readRegularFileSync(marker, MAX_GIT_MARKER_BYTES).toString(
    "utf8",
  );
  const reference = /^gitdir:[ \t]*(.+?)[ \t]*\r?\n?$/u.exec(contents)?.[1];
  if (!reference) throw new Error("Git marker has no valid gitdir reference.");
  return reference;
}
