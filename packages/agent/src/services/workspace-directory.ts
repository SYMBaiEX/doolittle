export type WorkspaceDirectorySource = string | (() => string);

export function resolveWorkspaceDirectory(
  source: WorkspaceDirectorySource,
): string {
  return typeof source === "function" ? source() : source;
}
