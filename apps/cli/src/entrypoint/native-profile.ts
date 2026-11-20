import { mkdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { readRegularFileSync } from "@doolittle/storage";

/** Each native profile (including saved conversations) stays with its original workspace. */
export function prepareNativeProfile(
  requestedWorkspace: string | undefined,
  requestedDataDir: string | undefined,
) {
  if (
    !requestedWorkspace ||
    !requestedDataDir ||
    !isAbsolute(requestedWorkspace) ||
    !isAbsolute(requestedDataDir)
  ) {
    throw new Error(
      "Native API requires absolute workspace and data directories.",
    );
  }
  const workspace = realpathSync(requestedWorkspace);
  const workspaceIdentity = statSync(workspace, { bigint: true });
  if (!workspaceIdentity.isDirectory()) {
    throw new Error("Native API workspace must be a directory.");
  }

  mkdirSync(requestedDataDir, { mode: 0o700, recursive: true });
  const dataDir = realpathSync(requestedDataDir);
  const profile = statSync(dataDir);
  if (
    !profile.isDirectory() ||
    (process.platform !== "win32" &&
      (profile.uid !== process.getuid?.() || (profile.mode & 0o077) !== 0))
  ) {
    throw new Error("Native API requires an owner-only data directory.");
  }
  const metadata = JSON.stringify({ workspace });
  const binding = join(dataDir, "native-workspace.json");
  try {
    writeFileSync(binding, metadata, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = readRegularFileSync(binding, 128 * 1024, {
      singleLink: true,
    }).toString("utf8");
    if (existing !== metadata) {
      throw new Error("This native profile belongs to a different workspace.");
    }
  }

  return {
    workspace,
    dataDir,
    workspaceIsCurrent() {
      try {
        if (realpathSync(workspace) !== workspace) return false;
        const current = statSync(workspace, { bigint: true });
        return (
          current.isDirectory() &&
          current.dev === workspaceIdentity.dev &&
          current.ino === workspaceIdentity.ino
        );
      } catch {
        return false;
      }
    },
  };
}
