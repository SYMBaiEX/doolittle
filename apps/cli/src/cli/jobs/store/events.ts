import {
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  lstatSync,
  openSync,
  writeFileSync,
} from "node:fs";
import { readRegularFileSync } from "@doolittle/storage";
import type { CliTurnEvent } from "../../turn-events";
import { encodeCliTurnEvent, parseCliTurnEvent } from "../../turn-events";
import type { CliJobIndex, CliJobRecord } from "../types";

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

export function hasExitedWorker(pid: number | undefined): boolean {
  if (pid === undefined || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH";
  }
}

export function openCliJobLog(path: string): number {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1)
    throw new Error("Job log is not a private regular file.");
  const descriptor = openSync(
    path,
    constants.O_WRONLY |
      constants.O_APPEND |
      (constants.O_NOFOLLOW ?? 0) |
      constants.O_NONBLOCK,
  );
  try {
    const opened = fstatSync(descriptor);
    if (
      !opened.isFile() ||
      opened.nlink !== 1 ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.size > 16 * 1024 * 1024
    )
      throw new Error("Job log is not a regular file.");
    fchmodSync(descriptor, 0o600);
    return descriptor;
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

export function appendCliJobEventToPath(
  logPath: string,
  event: CliTurnEvent,
): void {
  const encoded = encodeCliTurnEvent(event);
  const descriptor = openCliJobLog(logPath);
  try {
    const limit = 16 * 1024 * 1024;
    const reserve = event.type === "completed" ? 0 : 4096;
    if (
      fstatSync(descriptor).size + Buffer.byteLength(encoded, "utf8") >
      limit - reserve
    ) {
      if (event.type === "completed")
        throw new Error("Job log is full; terminal event cannot be stored.");
      return;
    }
    writeFileSync(descriptor, encoded, "utf8");
  } finally {
    closeSync(descriptor);
  }
}

function appendReaperTerminalEvents(
  job: CliJobRecord,
  timestamp: string,
): void {
  try {
    appendCliJobEventToPath(job.logPath, {
      type: "error",
      timestamp,
      message: `Background job process ${job.pid} exited before writing a terminal event; the job supervisor marked it failed.`,
    });
    appendCliJobEventToPath(job.logPath, {
      type: "completed",
      timestamp,
      status: "failed",
    });
  } catch {
    // A damaged or full event log must not prevent the persisted job state
    // from being repaired; the terminal state itself is written below.
  }
}

export function reconcileJobRecords(index: CliJobIndex): boolean {
  let changed = false;
  for (const job of index.jobs) {
    if (job.status !== "queued" && job.status !== "running") {
      continue;
    }
    let terminalEvent: Extract<CliTurnEvent, { type: "completed" }> | undefined;
    const workerExited = hasExitedWorker(job.pid);
    try {
      // An empty regular log cannot hold a terminal event. Queued and
      // running jobs usually have empty logs, and scanning every one of
      // them on each index access makes bulk operations quadratic in
      // filesystem syscalls.
      const info = lstatSync(job.logPath, { throwIfNoEntry: false });
      if (info?.isFile() && info.size === 0 && !workerExited) continue;
      terminalEvent = readCliJobEventsFromPath(job.logPath).find(
        (event): event is Extract<CliTurnEvent, { type: "completed" }> =>
          event.type === "completed",
      );
    } catch {
      // A damaged or oversized log cannot prevent listing or cancelling other jobs.
      continue;
    }
    if (!terminalEvent) {
      if (!workerExited) continue;
      const timestamp = new Date().toISOString();
      appendReaperTerminalEvents(job, timestamp);
      terminalEvent = { type: "completed", timestamp, status: "failed" };
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
