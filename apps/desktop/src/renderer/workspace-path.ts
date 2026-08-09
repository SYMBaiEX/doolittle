export type DesktopPlatform = "darwin" | "win32" | "linux";

export function compactWorkspacePath(value: string, maxSegments = 4): string {
  if (!Number.isSafeInteger(maxSegments) || maxSegments < 1) {
    throw new RangeError("maxSegments must be a positive integer.");
  }
  const parts = value.replaceAll("\\", "/").split("/").filter(Boolean);
  return parts.length > maxSegments
    ? `…/${parts.slice(-maxSegments).join("/")}`
    : value;
}

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
