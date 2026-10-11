import { lstatSync } from "node:fs";
import { join, resolve } from "node:path";

/** An operator-selected profile is not proof of a disposable inactive clone. */
export function assertExplicitSweepProfileUnlocked(root: string): void {
  const runtimeDir = join(resolve(root), "runtime", "pglite");
  for (const file of ["eliza-pglite.lock", "postmaster.pid"]) {
    try {
      lstatSync(join(runtimeDir, file));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    throw new Error(
      "Explicit sweep profiles must be prepared inactive clones without database locks. Use the default scrubbed profile or prepare a verified inactive clone; the sweep will not remove profile locks.",
    );
  }
}
