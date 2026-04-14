import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { PglitePidFileStatus } from "./types";

export function reconcilePglitePidFile(dataDir: string): PglitePidFileStatus {
  const pidPath = join(dataDir, "postmaster.pid");
  if (!existsSync(pidPath)) {
    return "missing";
  }

  try {
    const content = readFileSync(pidPath, "utf-8");
    const firstLine = content.split("\n")[0]?.trim();
    const pid = Number.parseInt(firstLine ?? "", 10);
    if (Number.isNaN(pid) || pid <= 0) {
      unlinkSync(pidPath);
      return "cleared-malformed";
    }

    try {
      process.kill(pid, 0);
      return "active";
    } catch (killErr: unknown) {
      const code = (killErr as NodeJS.ErrnoException).code;
      if (code === "ESRCH") {
        unlinkSync(pidPath);
        return "cleared-stale";
      }
      return "active-unconfirmed";
    }
  } catch {
    return "check-failed";
  }
}
