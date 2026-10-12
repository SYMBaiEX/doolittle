import {
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  rmdirSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { writeJsonAtomicSync } from "@elizaos/agent/utils/atomic-json";
import { readRegularFileSync } from "@/utils/read-regular-file";
import type { CliJobIndex, CliJobRecord, CliJobStatus } from "../types";
import { reconcileJobRecords } from "./events";

const MAX_INDEX_BYTES = 16 * 1024 * 1024;
const MAX_JOBS = 200;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const statuses = new Set<CliJobStatus>([
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export function isJobId(id: string): boolean {
  return UUID.test(id);
}
export function jobsRoot(dataDir: string): string {
  return join(dataDir, "cli-jobs");
}
export function jobPaths(dataDir: string, id: string) {
  if (!isJobId(id)) throw new Error("Invalid job id.");
  const root = join(jobsRoot(dataDir), id);
  return {
    root,
    stateDir: join(root, "state"),
    logPath: join(root, "events.jsonl"),
    controlPath: join(root, "control.json"),
    requestPath: join(root, "cancel-request.json"),
    heartbeatPath: join(root, "heartbeat"),
  };
}
function assertPrivateDirectory(path: string): void {
  const info = lstatSync(path);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    (process.platform !== "win32" && (info.mode & 0o077) !== 0)
  )
    throw new Error(`Unsafe job directory: ${path}`);
}
function assertDataDirectory(path: string): void {
  const info = lstatSync(realpathSync(path));
  if (
    !info.isDirectory() ||
    (process.platform !== "win32" && (info.mode & 0o022) !== 0) ||
    (process.getuid && info.uid !== process.getuid())
  )
    throw new Error("Unsafe job data directory.");
}
export function assertJobPaths(dataDir: string, id?: string): void {
  assertDataDirectory(dataDir);
  assertPrivateDirectory(jobsRoot(dataDir));
  if (id) {
    const paths = jobPaths(dataDir, id);
    assertPrivateDirectory(paths.root);
    assertPrivateDirectory(paths.stateDir);
  }
}
function indexPath(dataDir: string): string {
  return join(jobsRoot(dataDir), "jobs.json");
}
function ensureStore(dataDir: string): void {
  if (!existsSync(dataDir))
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  assertDataDirectory(dataDir);
  mkdirSync(jobsRoot(dataDir), { recursive: true, mode: 0o700 });
  assertJobPaths(dataDir);
}
function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}
function optionalNumber(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === "number" && Number.isSafeInteger(value))
  );
}
function validateRecord(dataDir: string, value: unknown): CliJobRecord {
  if (!value || typeof value !== "object")
    throw new Error("Invalid job record.");
  const job = value as Record<string, unknown>;
  if (
    typeof job.id !== "string" ||
    !isJobId(job.id) ||
    typeof job.prompt !== "string" ||
    typeof job.createdAt !== "string" ||
    typeof job.updatedAt !== "string" ||
    !statuses.has(job.status as CliJobStatus) ||
    !optionalString(job.sessionId) ||
    !optionalString(job.startedAt) ||
    !optionalString(job.completedAt) ||
    !optionalNumber(job.pid) ||
    !optionalNumber(job.exitCode)
  )
    throw new Error("Invalid job record.");
  const expected = jobPaths(dataDir, job.id);
  const compatiblePath =
    typeof job.stateDir === "string" &&
    typeof job.logPath === "string" &&
    basename(job.logPath) === "events.jsonl" &&
    realpathSync(job.stateDir) === realpathSync(expected.stateDir) &&
    realpathSync(dirname(job.logPath)) === realpathSync(expected.root);
  if (!compatiblePath) throw new Error("Job record path mismatch.");
  assertJobPaths(dataDir, job.id);
  return {
    ...job,
    stateDir: expected.stateDir,
    logPath: expected.logPath,
  } as unknown as CliJobRecord;
}
function readIndex(dataDir: string): CliJobIndex {
  ensureStore(dataDir);
  if (!existsSync(indexPath(dataDir)))
    writeJsonAtomicSync(indexPath(dataDir), { jobs: [] });
  const parsed: unknown = JSON.parse(
    readRegularFileSync(indexPath(dataDir), MAX_INDEX_BYTES, {
      singleLink: true,
    }).toString("utf8"),
  );
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as CliJobIndex).jobs) ||
    (parsed as CliJobIndex).jobs.length > MAX_JOBS
  )
    throw new Error("Invalid job index.");
  const jobs = (parsed as CliJobIndex).jobs.map((value) =>
    validateRecord(dataDir, value),
  );
  if (new Set(jobs.map((job) => job.id)).size !== jobs.length)
    throw new Error("Duplicate job id.");
  return { jobs };
}
function writeIndex(dataDir: string, index: CliJobIndex): void {
  if (index.jobs.length > MAX_JOBS)
    throw new Error("Job index exceeds maximum entries.");
  for (const record of index.jobs) validateRecord(dataDir, record);
  assertJobPaths(dataDir);
  if (Buffer.byteLength(JSON.stringify(index), "utf8") > MAX_INDEX_BYTES)
    throw new Error("Job index exceeds maximum bytes.");
  writeJsonAtomicSync(indexPath(dataDir), index);
}
function withLock<T>(dataDir: string, operation: () => T): T {
  ensureStore(dataDir);
  const lock = join(jobsRoot(dataDir), ".index-lock");
  const deadline = Date.now() + 2000;
  for (;;) {
    try {
      mkdirSync(lock, { mode: 0o700 });
      break;
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== "EEXIST" ||
        Date.now() >= deadline
      )
        throw new Error("Job index is locked.", { cause: error });
      try {
        const info = lstatSync(lock);
        if (!info.isDirectory() || info.isSymbolicLink())
          throw new Error("Unsafe job index lock.");
      } catch (inspectError) {
        if ((inspectError as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw inspectError;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
  try {
    return operation();
  } finally {
    rmdirSync(lock);
  }
}
export function readJobsIndex(dataDir: string): CliJobIndex {
  return withLock(dataDir, () => {
    const index = readIndex(dataDir);
    if (reconcileJobRecords(index)) writeIndex(dataDir, index);
    return index;
  });
}
export function updateJobsIndex<T>(
  dataDir: string,
  update: (index: CliJobIndex) => T,
): T {
  return withLock(dataDir, () => {
    const index = readIndex(dataDir);
    reconcileJobRecords(index);
    const result = update(index);
    writeIndex(dataDir, index);
    return result;
  });
}
export function mutateJob(
  dataDir: string,
  id: string,
  mutate: (job: CliJobRecord) => void,
): CliJobRecord | undefined {
  return updateJobsIndex(dataDir, (index) => {
    const job = index.jobs.find((entry) => entry.id === id);
    if (!job) return undefined;
    mutate(job);
    job.updatedAt = new Date().toISOString();
    return job;
  });
}
