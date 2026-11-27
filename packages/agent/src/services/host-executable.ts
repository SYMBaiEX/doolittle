import { realpathSync } from "node:fs";
import path from "node:path";
import { getHostExecutionBaseline, resolveHostExecutable } from "@elizaos/host";

function realpathDirectory(value: string): string | undefined {
  try {
    return realpathSync(value);
  } catch {
    return undefined;
  }
}

/**
 * Resolve an executable against the SDK's boot PATH authority without
 * treating merged-/usr directory aliases as distinct roots. The SDK compares
 * literal directories; this fallback only maps a candidate back into a PATH
 * entry whose canonical directory is the same, preserving the authority boundary.
 */
export function resolveHostExecutableWithinBootAuthority(
  nameOrPath: string,
): string | undefined {
  const direct = resolveHostExecutable(nameOrPath);
  if (direct) return direct;
  if (process.platform === "win32" || !path.isAbsolute(nameOrPath)) {
    return undefined;
  }

  const candidateDirectory = realpathDirectory(path.dirname(nameOrPath));
  if (!candidateDirectory) return undefined;
  const authorityPath = getHostExecutionBaseline().path;
  if (!authorityPath) return undefined;

  for (const entry of authorityPath.split(path.delimiter)) {
    if (realpathDirectory(entry) !== candidateDirectory) continue;
    const aliased = path.join(entry, path.basename(nameOrPath));
    const resolved = resolveHostExecutable(aliased);
    if (resolved) return resolved;
  }
  return undefined;
}

/** Return the router-accepted spelling when a boot-PATH directory alias exists. */
export function hostExecutableForRouter(nameOrPath: string): string {
  return resolveHostExecutableWithinBootAuthority(nameOrPath) ?? nameOrPath;
}
