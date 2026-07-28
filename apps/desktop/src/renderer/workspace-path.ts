export type DesktopPlatform = "darwin" | "win32" | "linux";

export function normalizeWorkspacePathForComparison(
  value: string,
  platform: DesktopPlatform,
): string {
  let normalized = value.trim().replace(/\\/gu, "/");
  if (normalized.length > 1) normalized = normalized.replace(/\/+$/gu, "");
  if (platform === "darwin") {
    normalized = normalized.replace(
      /^\/private(?=\/(?:etc|tmp|var)(?:\/|$))/u,
      "",
    );
  }
  return platform === "win32" ? normalized.toLowerCase() : normalized;
}

export function workspacePathsEqual(
  left: string | undefined,
  right: string,
  platform: DesktopPlatform,
): boolean {
  if (!left) return false;
  return (
    normalizeWorkspacePathForComparison(left, platform) ===
    normalizeWorkspacePathForComparison(right, platform)
  );
}
