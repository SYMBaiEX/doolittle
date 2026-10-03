import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from "node:fs";
import { join } from "node:path";

export const ACTION_DIAGNOSTIC_BYTE_LIMIT = 262144;
export const ACTION_DIAGNOSTIC_EVENT_LIMIT = 2048;
export const ACTION_CATEGORIES = [
  "coding",
  "delegation",
  "workspace",
  "files",
  "repository",
  "shell",
  "managed-app",
  "browser",
  "research",
  "session",
  "other",
] as const;
export type ActionCategory = (typeof ACTION_CATEGORIES)[number];
export interface ActionOutcomeCounts {
  started: number;
  completed: number;
  success: number;
  failure: number;
  unknown: number;
}
export interface ActionOutcomes {
  provenance: "doolittle-action-journal";
  coverage: "journal-event-occurrences-only";
  subject: "recorded-runtime-actions-not-worker-commands";
  duplicatePolicy: "count-each-record";
  status: "complete" | "partial" | "unavailable";
  journalAvailable: boolean;
  byteLimit: number;
  eventLimit: number;
  bytesRead: number;
  scannedRecords: number;
  acceptedEvents: number;
  rejectedRecords: number;
  truncated: boolean;
  categories: Record<ActionCategory, ActionOutcomeCounts>;
}

// Exact repository names: actions/coding-action.ts, file-action/wiring.ts,
// workspace-action/wiring.ts, repository-action.ts, shell-command-action.ts,
// app-server-action.ts, browser-analysis-action.ts, research-action.ts and
// session-search-action.ts. TASKS_SPAWN_AGENT and WEB_SEARCH are SDK action
// names referenced by coding-action.ts and doolittle-plugin/sdk-native-surface.ts.
const CATEGORY_BY_ACTION: ReadonlyMap<string, ActionCategory> = new Map([
  ["DOOLITTLE_CODING", "coding"],
  ["TASKS_SPAWN_AGENT", "delegation"],
  ["DOOLITTLE_WORKSPACE", "workspace"],
  ["READ_FILE", "files"],
  ["WRITE_FILE", "files"],
  ["CREATE_DIRECTORY", "files"],
  ["PATCH_FILE", "files"],
  ["SEARCH_FILES", "files"],
  ["DOOLITTLE_REPOSITORY", "repository"],
  ["SHELL", "shell"],
  ["DOOLITTLE_SHELL_SHORTCUT", "shell"],
  ["DOOLITTLE_APP_SERVER", "managed-app"],
  ["DOOLITTLE_BROWSER_ANALYZE", "browser"],
  ["DOOLITTLE_RESEARCH", "research"],
  ["WEB_SEARCH", "research"],
  ["DOOLITTLE_SESSION_SEARCH", "session"],
]);
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function unavailableActionOutcomes(): ActionOutcomes {
  const categories = {} as Record<ActionCategory, ActionOutcomeCounts>;
  for (const category of ACTION_CATEGORIES)
    categories[category] = {
      started: 0,
      completed: 0,
      success: 0,
      failure: 0,
      unknown: 0,
    };
  return {
    provenance: "doolittle-action-journal",
    coverage: "journal-event-occurrences-only",
    subject: "recorded-runtime-actions-not-worker-commands",
    duplicatePolicy: "count-each-record",
    status: "unavailable",
    journalAvailable: false,
    byteLimit: ACTION_DIAGNOSTIC_BYTE_LIMIT,
    eventLimit: ACTION_DIAGNOSTIC_EVENT_LIMIT,
    bytesRead: 0,
    scannedRecords: 0,
    acceptedEvents: 0,
    rejectedRecords: 0,
    truncated: false,
    categories,
  };
}

/** Bounded content-free projection. No raw labels/results/IDs leave this reader.
 * Syscalls are synchronous: byte/event caps bound data, not filesystem latency.
 */
export function readActionOutcomes(dataDir: string): ActionOutcomes {
  const output = unavailableActionOutcomes();
  let fd: number | undefined;
  try {
    // The caller owns this data root and has quiesced its child processes.
    // Validate the immediate directory boundary; O_NOFOLLOW alone only guards
    // the journal leaf. These identity checks are not race-proof openat traversal.
    const dataStat = lstatSync(dataDir, { bigint: true });
    if (!dataStat.isDirectory() || dataStat.isSymbolicLink())
      throw new Error("Unsupported diagnostic boundary.");
    const canonicalData = realpathSync(dataDir);
    const trajectories = join(dataDir, "trajectories");
    if (!existsSync(trajectories)) return output;
    const trajectoriesStat = lstatSync(trajectories, { bigint: true });
    if (!trajectoriesStat.isDirectory() || trajectoriesStat.isSymbolicLink())
      throw new Error("Unsupported diagnostic boundary.");
    const canonicalTrajectories = realpathSync(trajectories);
    if (canonicalTrajectories !== join(canonicalData, "trajectories"))
      throw new Error("Unsupported diagnostic boundary.");
    const path = join(trajectories, "trajectory-events.jsonl");
    output.journalAvailable = existsSync(path);
    if (!output.journalAvailable) return output;
    const leafStat = lstatSync(path, { bigint: true });
    if (!leafStat.isFile() || leafStat.isSymbolicLink())
      throw new Error("Unsupported diagnostic input.");
    const canonicalLeaf = realpathSync(path);
    if (
      canonicalLeaf !== join(canonicalTrajectories, "trajectory-events.jsonl")
    )
      throw new Error("Unsupported diagnostic boundary.");
    // Nonblocking/no-follow prevents FIFO or symlink input from introducing a
    // new blocking stream read. A regular file is still required after open.
    fd = openSync(
      canonicalLeaf,
      constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW,
    );
    const stat = fstatSync(fd, { bigint: true });
    const dataAfter = lstatSync(dataDir, { bigint: true });
    const trajectoriesAfter = lstatSync(trajectories, { bigint: true });
    const leafAfter = lstatSync(path, { bigint: true });
    if (
      !stat.isFile() ||
      stat.dev !== leafStat.dev ||
      stat.ino !== leafStat.ino ||
      !dataAfter.isDirectory() ||
      dataAfter.isSymbolicLink() ||
      dataAfter.dev !== dataStat.dev ||
      dataAfter.ino !== dataStat.ino ||
      realpathSync(dataDir) !== canonicalData ||
      !trajectoriesAfter.isDirectory() ||
      trajectoriesAfter.isSymbolicLink() ||
      trajectoriesAfter.dev !== trajectoriesStat.dev ||
      trajectoriesAfter.ino !== trajectoriesStat.ino ||
      realpathSync(trajectories) !== canonicalTrajectories ||
      !leafAfter.isFile() ||
      leafAfter.isSymbolicLink() ||
      leafAfter.dev !== stat.dev ||
      leafAfter.ino !== stat.ino ||
      realpathSync(path) !== canonicalLeaf
    )
      throw new Error("Unsupported diagnostic identity.");
    const byteLimit = BigInt(ACTION_DIAGNOSTIC_BYTE_LIMIT);
    output.truncated = stat.size > byteLimit;
    const bytes = Buffer.alloc(
      Number(stat.size < byteLimit ? stat.size : byteLimit),
    );
    while (output.bytesRead < bytes.length) {
      const read = readSync(
        fd,
        bytes,
        output.bytesRead,
        bytes.length - output.bytesRead,
        null,
      );
      if (!read) break;
      output.bytesRead += read;
    }
    let stored = bytes.subarray(0, output.bytesRead).toString("utf8");
    if (output.truncated)
      stored = stored.slice(0, stored.lastIndexOf("\n") + 1);
    for (const line of stored.split(/\r?\n/u)) {
      if (!line.trim()) continue;
      if (output.scannedRecords >= ACTION_DIAGNOSTIC_EVENT_LIMIT) {
        output.truncated = true;
        break;
      }
      output.scannedRecords++;
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        output.rejectedRecords++;
        continue;
      }
      if (!record(value)) {
        output.rejectedRecords++;
        continue;
      }
      if (value.category !== "action") continue;
      if (
        value.event !== "action.started" &&
        value.event !== "action.completed"
      ) {
        output.rejectedRecords++;
        continue;
      }
      const metadata = record(value.metadata) ? value.metadata : undefined;
      const category =
        typeof metadata?.action === "string"
          ? (CATEGORY_BY_ACTION.get(metadata.action) ?? "other")
          : "other";
      const counts = output.categories[category];
      output.acceptedEvents++;
      if (value.event === "action.started") counts.started++;
      else {
        counts.completed++;
        if (metadata?.success === true) counts.success++;
        else if (metadata?.success === false) counts.failure++;
        else counts.unknown++;
      }
    }
    output.status =
      output.truncated || output.rejectedRecords ? "partial" : "complete";
  } catch {
    output.rejectedRecords++;
    output.status = "partial";
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        output.rejectedRecords++;
        output.status = "partial";
      }
    }
  }
  return output;
}
