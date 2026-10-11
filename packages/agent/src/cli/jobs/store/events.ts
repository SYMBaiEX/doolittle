import { existsSync } from "node:fs";
import type { CliTurnEvent } from "@/cli/turn-events";
import { parseCliTurnEvent } from "@/cli/turn-events";
import { readRegularFileSync } from "@/utils/read-regular-file";
import type { CliJobIndex } from "../types";

export function readCliJobEventsFromPath(logPath: string): CliTurnEvent[] {
  if (!existsSync(logPath)) {
    return [];
  }
  return readRegularFileSync(logPath, 16 * 1024 * 1024, { singleLink: true })
    .toString("utf8")
    .split(/\r?\n/u)
    .map((line) => parseCliTurnEvent(line))
    .filter((entry): entry is CliTurnEvent => Boolean(entry));
}

export function reconcileJobRecords(index: CliJobIndex): boolean {
  let changed = false;
  for (const job of index.jobs) {
    if (job.status !== "queued" && job.status !== "running") {
      continue;
    }
    let terminalEvent: CliTurnEvent | undefined;
    try {
      terminalEvent = readCliJobEventsFromPath(job.logPath).find(
        (event) => event.type === "completed",
      );
    } catch {
      // A damaged or oversized log cannot prevent listing or cancelling other jobs.
      continue;
    }
    if (!terminalEvent) continue;

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
