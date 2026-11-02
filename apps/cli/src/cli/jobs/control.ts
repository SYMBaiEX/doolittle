import { randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  ftruncateSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  openSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { readRegularFileSync } from "@doolittle/agent/utils/read-regular-file";
import { writeJsonAtomicSync } from "@elizaos/core";
import { assertJobPaths, isJobId, jobPaths } from "./store/index-store";

const MAX_CONTROL_BYTES = 1024;
// Job control is a create-once capability. Stage privately with the SDK's
// atomic writer, then publish without replacing another process's capability.
function publishControl(
  path: string,
  control: { id: string; nonce: string },
): void {
  const staging = mkdtempSync(join(dirname(path), ".job-control-"));
  try {
    const payload = join(staging, "control.json");
    writeJsonAtomicSync(payload, control, { skipMkdir: true });
    linkSync(payload, path);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
function readControl(path: string): { id: string; nonce: string } {
  const value: unknown = JSON.parse(
    readRegularFileSync(path, MAX_CONTROL_BYTES, { singleLink: true }).toString(
      "utf8",
    ),
  );
  if (!value || typeof value !== "object")
    throw new Error("Invalid job control.");
  const result = value as { id?: unknown; nonce?: unknown };
  if (
    typeof result.id !== "string" ||
    !isJobId(result.id) ||
    typeof result.nonce !== "string" ||
    !/^[a-f0-9]{64}$/u.test(result.nonce)
  )
    throw new Error("Invalid job control.");
  return { id: result.id, nonce: result.nonce };
}
export function createJobControl(dataDir: string, id: string): string {
  assertJobPaths(dataDir, id);
  const nonce = randomBytes(32).toString("hex");
  publishControl(jobPaths(dataDir, id).controlPath, { id, nonce });
  return nonce;
}
export function requestJobCancel(
  dataDir: string,
  id: string,
): "requested" | "cannot-request" {
  try {
    assertJobPaths(dataDir, id);
    const paths = jobPaths(dataDir, id);
    const control = readControl(paths.controlPath);
    if (control.id !== id) return "cannot-request";
    if (existsSync(paths.requestPath)) {
      const existing = readControl(paths.requestPath);
      return existing.id === id && existing.nonce === control.nonce
        ? "requested"
        : "cannot-request";
    }
    try {
      publishControl(paths.requestPath, control);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = readControl(paths.requestPath);
      return existing.id === id && existing.nonce === control.nonce
        ? "requested"
        : "cannot-request";
    }
    return "requested";
  } catch {
    return "cannot-request";
  }
}
function heartbeat(path: string): void {
  const existing = existsSync(path);
  const before = existing ? lstatSync(path) : undefined;
  if (before) {
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1)
      throw new Error("Invalid heartbeat file.");
  }
  const fd = openSync(
    path,
    constants.O_WRONLY |
      constants.O_NONBLOCK |
      (constants.O_NOFOLLOW ?? 0) |
      (existing ? 0 : constants.O_CREAT | constants.O_EXCL),
    0o600,
  );
  try {
    const opened = fstatSync(fd);
    if (
      !opened.isFile() ||
      opened.nlink !== 1 ||
      (before && (before.dev !== opened.dev || before.ino !== opened.ino))
    )
      throw new Error("Invalid heartbeat file.");
    ftruncateSync(fd, 0);
    writeFileSync(fd, String(Date.now()));
  } finally {
    closeSync(fd);
  }
}
export function monitorJobCancel(
  dataDir: string,
  id: string,
  nonce: string,
  abort: () => void,
): () => void {
  assertJobPaths(dataDir, id);
  const paths = jobPaths(dataDir, id);
  const control = readControl(paths.controlPath);
  if (control.id !== id || control.nonce !== nonce)
    throw new Error("Job control identity mismatch.");
  const poll = () => {
    try {
      assertJobPaths(dataDir, id);
      heartbeat(paths.heartbeatPath);
      if (existsSync(paths.requestPath)) {
        const request = readControl(paths.requestPath);
        if (request.id === id && request.nonce === nonce) abort();
      }
    } catch {
      /* A malformed or linked request cannot cancel this turn. */
    }
  };
  poll();
  const timer = setInterval(poll, 250);
  return () => clearInterval(timer);
}
