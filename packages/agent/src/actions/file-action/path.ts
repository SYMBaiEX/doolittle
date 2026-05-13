import { existsSync } from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  resolve,
  sep,
} from "node:path";

const LOCAL_DEV_ROOT_SUFFIXES = ["dev", "code", "projects"] as const;

function uniqueExistingRoots(roots: string[]): string[] {
  const seen = new Set<string>();
  return roots
    .map((root) => resolve(root))
    .filter((root) => {
      if (seen.has(root) || !existsSync(root)) {
        return false;
      }
      seen.add(root);
      return true;
    });
}

export function getAllowedLocalFileRoots(workspaceDir: string): string[] {
  const home = process.env.HOME ?? workspaceDir;
  return uniqueExistingRoots([
    workspaceDir,
    ...LOCAL_DEV_ROOT_SUFFIXES.map((suffix) => join(home, suffix)),
  ]);
}

function isInside(parent: string, child: string): boolean {
  const normalizedParent = normalize(
    parent.endsWith(sep) ? parent : `${parent}${sep}`,
  );
  const normalizedChild = normalize(child);
  return (
    normalizedChild === normalize(parent) ||
    normalizedChild.startsWith(normalizedParent)
  );
}

function expandLocalPath(inputPath: string, workspaceDir: string): string {
  const trimmed = inputPath.trim();
  const home = process.env.HOME ?? workspaceDir;
  const homeName = basename(home);
  const homeParent = dirname(home);

  if (trimmed.startsWith("~/")) {
    return resolve(home, trimmed.slice(2));
  }

  if (trimmed === homeName || trimmed.startsWith(`${homeName}/`)) {
    return resolve(homeParent, trimmed);
  }

  if (/^(dev|code|projects)(?:\/|$)/u.test(trimmed)) {
    return resolve(home, trimmed);
  }

  if (isAbsolute(trimmed)) {
    return resolve(trimmed);
  }

  return resolve(workspaceDir, trimmed);
}

export function resolveLocalFilePath(
  inputPath: string,
  workspaceDir: string,
  options: { mustExist?: boolean } = {},
): string {
  const trimmed = inputPath.trim();
  if (!trimmed) {
    throw new Error("Path is required.");
  }

  const resolvedPath = expandLocalPath(trimmed, workspaceDir);
  const roots = getAllowedLocalFileRoots(workspaceDir);
  if (!roots.some((root) => isInside(root, resolvedPath))) {
    throw new Error(
      `Path must stay inside a local development root (${roots.join(", ")}).`,
    );
  }

  if (options.mustExist && !existsSync(resolvedPath)) {
    throw new Error(`Path not found: ${inputPath}`);
  }

  return resolvedPath;
}
