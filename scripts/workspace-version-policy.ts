export interface WorkspacePackageIdentity {
  name?: unknown;
  version?: unknown;
}

export interface WorkspaceVersionMismatch {
  name: string;
  actual: string;
  expected: string;
}

/** Keep every Doolittle-owned workspace on the root release version. */
export function findDoolittleWorkspaceVersionMismatch(
  manifest: WorkspacePackageIdentity,
  expected: string,
): WorkspaceVersionMismatch | undefined {
  if (
    typeof manifest.name !== "string" ||
    !manifest.name.startsWith("@doolittle/")
  ) {
    return undefined;
  }
  const actual =
    typeof manifest.version === "string" ? manifest.version : "unknown";
  return actual === expected
    ? undefined
    : { name: manifest.name, actual, expected };
}
