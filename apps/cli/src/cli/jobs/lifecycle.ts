import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { EnvConfig } from "@doolittle/agent/types";
import { readRegularFileSync } from "@doolittle/agent/utils/read-regular-file";
import type { CliTurnEvent } from "../turn-events";
import { parseCliTurnEvent } from "../turn-events";
import { createJobControl, requestJobCancel } from "./control";
import {
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
  const seen = new Set<string>();
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

export async function launchCliBackgroundJob(params: {
  config: EnvConfig;
  launcherPath: string;
  prompt: string;
  sessionId?: string;
}): Promise<CliJobRecord> {
  if (Buffer.byteLength(params.prompt, "utf8") > 1024 * 1024)
    throw new Error("Background prompt exceeds 1 MiB.");
  const record = createCliJob(params.config.dataDir, params.prompt);

  let child: ChildProcess | undefined;
  try {
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
        // Only explicitly bounded structured events may enter events.jsonl.
        stdio: ["pipe", "ignore", "ignore"],
        env: {
          ...process.env,
          DOOLITTLE_DATA_DIR: record.stateDir,
          DOOLITTLE_JOB_CONTROL_DIR: params.config.dataDir,
          DOOLITTLE_JOB_CONTROL_NONCE: nonce,
          PGLITE_DATA_DIR: join(record.stateDir, "pglite"),
        },
      },
    );
    child = spawnedChild;

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
      spawnedChild.once("exit", () => {
        if (!spawned || !delivered)
          reject(new Error("Background child exited before prompt delivery."));
      });
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
    finalizeCliJob(params.config.dataDir, record.id, "failed", 1);
    throw error;
  }
}
