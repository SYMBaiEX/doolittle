import type { BackendLaunchTarget } from "./backend";

export function sourceRootOverride(
  isPackaged: boolean,
  value: string | undefined,
): string | undefined {
  if (isPackaged) return undefined;
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function selectBackendLaunchTarget({
  isPackaged,
  packagedRuntime,
  sourceRuntime,
}: {
  isPackaged: boolean;
  packagedRuntime: BackendLaunchTarget | null;
  sourceRuntime: BackendLaunchTarget | null;
}): BackendLaunchTarget {
  if (!isPackaged) {
    if (!sourceRuntime) {
      throw new Error("The Doolittle source runtime could not be located.");
    }
    return sourceRuntime;
  }
  if (!packagedRuntime) {
    throw new Error(
      "The packaged Doolittle runtime is missing from resources/runtime.",
    );
  }
  return packagedRuntime;
}
