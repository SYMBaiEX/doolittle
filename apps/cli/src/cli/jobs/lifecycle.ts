import { type ChildProcess, spawn } from "node:child_process";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
} from "node:fs";
import { join, resolve } from "node:path";
import type { EnvConfig } from "@doolittle/agent/types";
import { readRegularFileSync, writeVerifiedFileSync } from "@doolittle/storage";
import { sanitizeSingleLineTerminalText } from "../render-utils";
import type { CliTurnEvent } from "../turn-events";
import { parseCliTurnEvent } from "../turn-events";
import { createJobControl, requestJobCancel } from "./control";
import {
  appendCliJobEvent,
  createCliJob,
  finalizeCliJob,
  getCliJob,
  markCliJobStarted,
} from "./store";
import { assertJobPaths, jobPaths } from "./store/index-store";
import type { CliJobRecord } from "./types";

export async function attachCliJob(
  dataDir: string,
  id: string,
  handlers?: {
    onLine?: (line: string) => void;
    onEvent?: (event: CliTurnEvent) => void;
  },
): Promise<CliJobRecord | undefined> {
  let offset = 0;
  while (true) {
    const job = getCliJob(dataDir, id);
    if (!job) {
      return undefined;
    }
    assertJobPaths(dataDir, id);
    if (existsSync(job.logPath)) {
      const raw = readRegularFileSync(job.logPath, 16 * 1024 * 1024, {
        singleLink: true,
      }).toString("utf8");
      const end = raw.lastIndexOf("\n") + 1;
      const unread = raw.slice(offset, end);
      offset = end;
      for (const line of unread.split(/\r?\n/u)) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }
        handlers?.onLine?.(trimmed);
        const event = parseCliTurnEvent(trimmed);
        if (event) {
          handlers?.onEvent?.(event);
        }
      }
    }

    if (job.status !== "queued" && job.status !== "running") {
      return job;
    }

    const heartbeatPath = jobPaths(dataDir, id).heartbeatPath;
    if (existsSync(heartbeatPath)) {
      try {
        const raw = readRegularFileSync(heartbeatPath, 64, {
          singleLink: true,
        }).toString("utf8");
        const at = Number(raw);
        if (
          !Number.isSafeInteger(at) ||
          at > Date.now() + 1000 ||
          Date.now() - at > 10_000
        )
          return job;
      } catch {
        return job;
      }
    } else {
      const createdAt = Date.parse(job.createdAt);
      if (
        !Number.isFinite(createdAt) ||
        createdAt > Date.now() + 1000 ||
        Date.now() - createdAt > 10_000
      )
        return job;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
}

export type CancelCliJobResult =
  | { kind: "not-found"; id: string }
  | { kind: "already-terminal"; job: CliJobRecord }
  | { kind: "requested"; job: CliJobRecord }
  | { kind: "cannot-request"; job: CliJobRecord };

export function cancelCliJob(dataDir: string, id: string): CancelCliJobResult {
  const job = getCliJob(dataDir, id);
  if (!job) return { kind: "not-found", id };
  if (job.status !== "queued" && job.status !== "running")
    return { kind: "already-terminal", job };
  return { kind: requestJobCancel(dataDir, id), job };
}

const INHERITED_BOOT_FILES = [
  "onboarding.json",
  "settings.json",
  "personality.json",
  "hooks.json",
  "skills.json",
  "secret-salt",
] as const;
const MAX_INHERITED_BOOT_FILE_BYTES = 1024 * 1024;
const CHILD_STARTUP_GRACE_MS = 1_000;
const MAX_STDERR_TAIL_BYTES = 8 * 1024;
const MAX_STDERR_DETAIL_CHARS = 1_200;

type ChildExit = {
  code: number | null;
  signal: NodeJS.Signals | null;
};

/**
 * Runtime state is per-job so concurrent workers do not share a PGlite
 * database or mutable run journals. Boot and operator configuration are not
 * runtime state: the child needs a launch-time snapshot of those files to pass
 * onboarding and use the same provider, hook, personality, and encryption
 * configuration as the profile that launched it.
 */
function seedJobBootState(sourceDataDir: string, stateDir: string): void {
  for (const name of INHERITED_BOOT_FILES) {
    const source = join(sourceDataDir, name);
    if (!existsSync(source)) continue;
    const bytes = readRegularFileSync(source, MAX_INHERITED_BOOT_FILE_BYTES);
    writeVerifiedFileSync(join(stateDir, name), bytes);
  }
}

function openJobStderr(path: string): number {
  const descriptor = openSync(
    path,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_APPEND |
      (constants.O_NOFOLLOW ?? 0),
    0o600,
  );
  try {
    if (!fstatSync(descriptor).isFile())
      throw new Error("Job stderr capture is not a regular file.");
    return descriptor;
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

function readJobStderrTail(path: string, maxBytes = MAX_STDERR_TAIL_BYTES) {
  let descriptor: number | undefined;
  try {
    const leaf = lstatSync(path);
    if (!leaf.isFile() || leaf.isSymbolicLink()) return "";
    descriptor = openSync(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | constants.O_NONBLOCK,
    );
    const opened = fstatSync(descriptor);
    if (
      !opened.isFile() ||
      opened.dev !== leaf.dev ||
      opened.ino !== leaf.ino ||
      opened.size === 0
    )
      return "";
    const length = Math.min(opened.size, maxBytes);
    const start = opened.size - length;
    const bytes = Buffer.alloc(length);
    let offset = 0;
    while (offset < length) {
      const count = readSync(
        descriptor,
        bytes,
        offset,
        length - offset,
        start + offset,
      );
      if (count === 0) break;
      offset += count;
    }
    return bytes.subarray(0, offset).toString("utf8");
  } catch {
    return "";
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // Best-effort diagnostic capture only.
      }
    }
  }
}

function capturedStderrDetail(path: string): string {
  const sanitized = sanitizeSingleLineTerminalText(readJobStderrTail(path));
  return sanitized.length > MAX_STDERR_DETAIL_CHARS
    ? `${sanitized.slice(0, MAX_STDERR_DETAIL_CHARS - 1)}…`
    : sanitized;
}

function jobIsTerminal(dataDir: string, id: string): boolean {
  const status = getCliJob(dataDir, id)?.status;
  return (
    status === "completed" || status === "failed" || status === "cancelled"
  );
}

function finalizeFailedJobStart(
  dataDir: string,
  id: string,
  message: string,
  exitCode = 1,
): void {
  if (jobIsTerminal(dataDir, id)) return;
  finalizeCliJob(dataDir, id, "failed", exitCode);
  const timestamp = new Date().toISOString();
  try {
    appendCliJobEvent(dataDir, id, {
      type: "error",
      timestamp,
      message,
    });
    appendCliJobEvent(dataDir, id, {
      type: "completed",
      timestamp,
      status: "failed",
    });
  } catch {
    // The index is already terminal; diagnostics are best-effort if the log
    // itself is damaged or full.
  }
}

function childExitDescription(exit: ChildExit): string {
  return exit.signal ? `signal ${exit.signal}` : `exit code ${exit.code ?? 1}`;
}

async function waitForEarlyExit(
  exited: Promise<ChildExit>,
): Promise<ChildExit | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      exited,
      new Promise<undefined>((done) => {
        timer = setTimeout(() => done(undefined), CHILD_STARTUP_GRACE_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function launchCliBackgroundJob(params: {
  config: EnvConfig;
  launcherPath: string;
  prompt: string;
  sessionId?: string;
}): Promise<CliJobRecord> {
  if (Buffer.byteLength(params.prompt, "utf8") > 1024 * 1024)
    throw new Error("Background prompt exceeds 1 MiB.");
  const record = createCliJob(params.config.dataDir, params.prompt);
  const paths = jobPaths(params.config.dataDir, record.id);

  let child: ChildProcess | undefined;
  let stderrDescriptor: number | undefined;
  try {
    seedJobBootState(params.config.dataDir, record.stateDir);
    stderrDescriptor = openJobStderr(paths.stderrPath);
    const nonce = createJobControl(params.config.dataDir, record.id);
    const spawnedChild = spawn(
      process.execPath,
      [
        params.launcherPath,
        "exec",
        "--prompt-stdin",
        "--json-stream",
        "--job-id",
        record.id,
        ...(params.sessionId ? ["--session-id", params.sessionId] : []),
      ],
      {
        cwd: resolve(process.cwd()),
        detached: true,
        // Structured events stay in events.jsonl. Stderr is not machine-event
        // data, but it is indispensable when the child dies before activation.
        stdio: ["pipe", "ignore", stderrDescriptor],
        env: {
          ...process.env,
          DOOLITTLE_DATA_DIR: record.stateDir,
          DOOLITTLE_JOB_CONTROL_DIR: params.config.dataDir,
          DOOLITTLE_JOB_CONTROL_NONCE: nonce,
          PGLITE_DATA_DIR: join(record.stateDir, "pglite"),
          ELIZA_ACP_STATE_DIR: join(record.stateDir, "plugin-acp"),
          ACP_AUDIT_LOG_PATH: join(
            record.stateDir,
            "plugin-acp",
            "audit.ndjson",
          ),
        },
      },
    );
    child = spawnedChild;
    const exited = new Promise<ChildExit>((done) => {
      spawnedChild.once("exit", (code, signal) => done({ code, signal }));
    });

    await new Promise<void>((resolvePromise, reject) => {
      const stdin = spawnedChild.stdin;
      if (!stdin) {
        reject(new Error("Background prompt pipe unavailable."));
        return;
      }
      let spawned = false;
      let delivered = false;
      const ready = () => {
        if (spawned && delivered) resolvePromise();
      };
      spawnedChild.once("error", reject);
      spawnedChild.once("spawn", () => {
        spawned = true;
        ready();
      });
      stdin.once("error", reject);
      stdin.end(params.prompt, (error?: Error | null) => {
        if (error) reject(error);
        else {
          delivered = true;
          ready();
        }
      });
    });

    const earlyExit = await waitForEarlyExit(exited);
    if (earlyExit && !jobIsTerminal(params.config.dataDir, record.id)) {
      const reason = `Background child exited during startup before writing a terminal event (${childExitDescription(earlyExit)}).`;
      const detail = capturedStderrDetail(paths.stderrPath);
      const message = detail ? `${reason} Child stderr: ${detail}` : reason;
      finalizeFailedJobStart(
        params.config.dataDir,
        record.id,
        message,
        earlyExit.code ?? 1,
      );
      throw new Error(message);
    }

    spawnedChild.unref();
    markCliJobStarted(params.config.dataDir, record.id, {
      pid: spawnedChild.pid ?? 0,
      sessionId: params.sessionId,
    });
    return getCliJob(params.config.dataDir, record.id) ?? record;
  } catch (error) {
    try {
      child?.kill();
    } catch {
      /* Only the freshly spawned child handle is eligible. */
    }
    if (!jobIsTerminal(params.config.dataDir, record.id)) {
      const reason =
        error instanceof Error ? error.message : String(error ?? "unknown");
      const detail = capturedStderrDetail(paths.stderrPath);
      const base = `Background child failed before startup completed: ${reason}`;
      finalizeFailedJobStart(
        params.config.dataDir,
        record.id,
        detail ? `${base}. Child stderr: ${detail}` : base,
      );
    }
    throw error;
  } finally {
    if (stderrDescriptor !== undefined) {
      try {
        closeSync(stderrDescriptor);
      } catch {
        // The child owns its inherited descriptor after spawn.
      }
    }
  }
}
