import { existsSync, lstatSync } from "node:fs";
import { readRegularFileSync } from "@doolittle/storage";
import type { CliTurnEvent } from "../../turn-events";
import { parseCliTurnEvent } from "../../turn-events";
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
      // An empty regular log cannot hold a terminal event. Queued and
      // running jobs usually have empty logs, and scanning every one of
      // them on each index access makes bulk operations quadratic in
      // filesystem syscalls.
      const info = lstatSync(job.logPath, { throwIfNoEntry: false });
      if (info?.isFile() && info.size === 0) continue;
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
