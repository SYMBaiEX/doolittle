import { dirname, join, normalize, resolve, sep } from "node:path";

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
