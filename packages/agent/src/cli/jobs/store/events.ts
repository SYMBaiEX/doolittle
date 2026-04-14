import { existsSync, readFileSync } from "node:fs";
import type { CliTurnEvent } from "@/cli/turn-events";
import { parseCliTurnEvent } from "@/cli/turn-events";
import type { CliJobIndex } from "../types";

export function readCliJobEventsFromPath(logPath: string): CliTurnEvent[] {
  if (!existsSync(logPath)) {
    return [];
  }
  return readFileSync(logPath, "utf8")
    .split(/\r?\n/u)
    .map((line) => parseCliTurnEvent(line))
    .filter((entry): entry is CliTurnEvent => Boolean(entry));
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function reconcileJobRecords(index: CliJobIndex): boolean {
  let changed = false;
  for (const job of index.jobs) {
    if (job.status !== "queued" && job.status !== "running") {
      continue;
    }
    if (job.pid && isProcessAlive(job.pid)) {
      continue;
    }

    const terminalEvent = readCliJobEventsFromPath(job.logPath)
      .reverse()
      .find((event) => event.type === "completed");
    if (!terminalEvent) {
      if (job.status === "running") {
        job.status = "failed";
        job.exitCode ??= 1;
        job.completedAt ??= new Date().toISOString();
        job.pid = undefined;
        changed = true;
      }
      continue;
    }

    job.status = terminalEvent.status;
    job.completedAt ??= terminalEvent.timestamp;
    job.exitCode ??=
      terminalEvent.status === "completed"
        ? 0
        : terminalEvent.status === "cancelled"
          ? 130
          : 1;
    job.pid = undefined;
    changed = true;
  }
  return changed;
}
