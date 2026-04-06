import { spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import type { EnvConfig } from "@/types";
import type { CliTurnEvent } from "../turn-events";
import { parseCliTurnEvent } from "../turn-events";
import {
  appendCliJobEvent,
  createCliJob,
  finalizeCliJob,
  getCliJob,
  markCliJobStarted,
} from "./store";
import type { CliJobRecord } from "./types";

export async function attachCliJob(
  dataDir: string,
  id: string,
  handlers?: {
    onLine?: (line: string) => void;
    onEvent?: (event: CliTurnEvent) => void;
  },
): Promise<CliJobRecord | undefined> {
  const seen = new Set<string>();
  while (true) {
    const job = getCliJob(dataDir, id);
    if (!job) {
      return undefined;
    }
    if (existsSync(job.logPath)) {
      const raw = readFileSync(job.logPath, "utf8");
      for (const line of raw.split(/\r?\n/u)) {
        const trimmed = line.trim();
        if (!trimmed || seen.has(trimmed)) {
          continue;
        }
        seen.add(trimmed);
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

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
}

export function cancelCliJob(
  dataDir: string,
  id: string,
): CliJobRecord | undefined {
  const job = getCliJob(dataDir, id);
  if (!job) {
    return undefined;
  }

  if (job.pid) {
    try {
      process.kill(job.pid, "SIGTERM");
    } catch {
      // Best effort only.
    }
  }

  appendCliJobEvent(dataDir, id, {
    type: "completed",
    timestamp: new Date().toISOString(),
    status: "cancelled",
  });
  return finalizeCliJob(dataDir, id, "cancelled");
}

export function launchCliBackgroundJob(params: {
  config: EnvConfig;
  launcherPath: string;
  prompt: string;
  sessionId?: string;
}): CliJobRecord {
  const record = createCliJob(params.config.dataDir, params.prompt);

  const stdoutFd = openSync(record.logPath, "a");
  const stderrFd = openSync(record.logPath, "a");
  const child = spawn(
    process.execPath,
    [
      params.launcherPath,
      "exec",
      "--prompt",
      params.prompt,
      "--json-stream",
      "--job-id",
      record.id,
      ...(params.sessionId ? ["--session-id", params.sessionId] : []),
    ],
    {
      cwd: resolve(process.cwd()),
      detached: true,
      stdio: ["ignore", stdoutFd, stderrFd],
      env: {
        ...process.env,
        DOOLITTLE_DATA_DIR: record.stateDir,
        DOOLITTLE_JOB_CONTROL_DIR: params.config.dataDir,
        PGLITE_DATA_DIR: join(record.stateDir, "pglite"),
      },
    },
  );

  child.unref();
  closeSync(stdoutFd);
  closeSync(stderrFd);
  markCliJobStarted(params.config.dataDir, record.id, {
    pid: child.pid ?? 0,
    sessionId: params.sessionId,
  });
  return getCliJob(params.config.dataDir, record.id) ?? record;
}

export function jobHasLiveLog(dataDir: string, id: string): boolean {
  const job = getCliJob(dataDir, id);
  if (!job || !existsSync(job.logPath)) {
    return false;
  }
  try {
    return statSync(job.logPath).size > 0;
  } catch {
    return false;
  }
}
