export function workspaceRelativePath(candidate: string): string {
  return candidate.replaceAll("\\", "/");
}
