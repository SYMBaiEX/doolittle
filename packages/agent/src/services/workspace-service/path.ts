import { existsSync, realpathSync } from "node:fs";
import { dirname, join, normalize, relative, resolve, sep } from "node:path";
import { assertWorkspacePathIsSafe } from "./policy";

export function resolveWorkspacePath(
  workspaceDir: string,
  path: string,
): string {
  const trimmed = path.trim();
  const resolvedPath = resolve(
    trimmed.startsWith(workspaceDir) ? trimmed : join(workspaceDir, trimmed),
  );
  const normalizedWorkspace = normalize(
    workspaceDir.endsWith(sep) ? workspaceDir : `${workspaceDir}${sep}`,
  );

  if (
    resolvedPath !== workspaceDir &&
    !resolvedPath.startsWith(normalizedWorkspace)
  ) {
    throw new Error("Path must stay inside the configured workspace.");
  }

  return resolvedPath;
}

export function workspaceRelativePath(candidate: string): string {
  return candidate.replaceAll("\\", "/");
}

export function workspaceDirname(path: string): string {
  return dirname(path);
}

export function assertWorkspacePathResolvesInside(
  workspaceDir: string,
  candidate: string,
): void {
  const realWorkspace = realpathSync(workspaceDir);
  let existingAncestor = candidate;
  while (!existsSync(existingAncestor)) {
    const parent = dirname(existingAncestor);
    if (parent === existingAncestor) break;
    existingAncestor = parent;
  }

  const realCandidate = realpathSync(existingAncestor);
  const normalizedWorkspace = normalize(
    realWorkspace.endsWith(sep) ? realWorkspace : `${realWorkspace}${sep}`,
  );
  if (
    realCandidate !== realWorkspace &&
    !realCandidate.startsWith(normalizedWorkspace)
  ) {
    throw new Error("Workspace path cannot resolve outside the workspace.");
  }
}

export function resolveWorkspaceServicePath(
  workspaceDir: string,
  path: string,
  operation: "read" | "write",
): string {
  const resolvedPath = resolveWorkspacePath(workspaceDir, path);
  const relativePath = workspaceRelativePath(
    relative(workspaceDir, resolvedPath),
  );
  assertWorkspacePathIsSafe(relativePath, operation);
  assertWorkspacePathResolvesInside(workspaceDir, resolvedPath);
  return resolvedPath;
}
