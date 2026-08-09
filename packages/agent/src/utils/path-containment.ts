import { isAbsolute, relative, sep } from "node:path";

/**
 * Returns true only when candidate is a strict descendant of root.
 * Callers must canonicalize paths first when symlink traversal matters.
 */
export function isStrictlyContainedPath(
  root: string,
  candidate: string,
): boolean {
  const nestedPath = relative(root, candidate);
  return (
    nestedPath !== "" &&
    nestedPath !== ".." &&
    !nestedPath.startsWith(`..${sep}`) &&
    !isAbsolute(nestedPath)
  );
}
