import { createHash } from "node:crypto";
import { isMainThread, Worker, type WorkerOptions } from "node:worker_threads";
import {
  SHARED_ENGINE_DEFAULT_BOOT_TIMEOUT_MS,
  SHARED_ENGINE_DEFAULT_CONCURRENT_STARTS,
  SHARED_ENGINE_MAX_WORKERS,
} from "@doolittle/contracts/engine";
import {
  BOT_ID_PATTERN,
  boundedMessage,
  ENGINE_HOST_PROTOCOL,
  ENGINE_PROTOCOL,
  ENGINE_WORKER_PROTOCOL,
  type EngineReady,
  type EngineRequest,
  isEngineReady,
  isEngineRequest,
  isRecord,
  isWorkerHostRequest,
  isWorkerHostResponse,
  MAX_HOST_MESSAGE_BYTES,
  UUID_PATTERN,
} from "./protocol";

type EngineWorker = Pick<Worker, "on" | "postMessage" | "terminate">;
type WorkerFactory = (entryUrl: URL, options: WorkerOptions) => EngineWorker;

interface PendingHostRequest {
  sequence: number;
  delivered: boolean;
  isClaim: boolean;
}

interface Resident {
  botId: string;
  environmentKey: string;
  environment?: Record<string, string>;
  worker?: EngineWorker;
  ready: Promise<EngineReady>;
  resolve: (ready: EngineReady) => void;
  reject: (error: Error) => void;
  closed: Promise<void>;
  close: () => void;
  startupTimer?: ReturnType<typeof setTimeout>;
  stopping: boolean;
  requestedStop: boolean;
  exited: boolean;
  stopPromise?: Promise<void>;
  lastSequence: number;
  pendingHostRequests: Map<string, PendingHostRequest>;
  diagnosticCode?: "module-resolution" | "worker-error" | "worker-exit";
}

export interface SharedEngineHostOptions {
  workerFactory?: WorkerFactory;
  maxWorkers?: number;
  maxConcurrentStarts?: number;
  startupTimeoutMs?: number;
  stopTimeoutMs?: number;
  ipc?: Pick<NodeJS.Process, "on" | "send">;
  enabled?: boolean;
  onDiagnostic?: (diagnostic: { botId: string; code: string }) => void;
}

const STATIC_ERRORS = {
  invalid: "Invalid engine request.",
  capacity: "The shared engine is at capacity.",
  configuration: "The named engine is running with a different configuration.",
  startup: "The named engine could not start.",
  stopped: "The named engine stopped before it became ready.",
  unavailable: "The shared engine is unavailable.",
  quota: "Too many host requests are in flight.",
  duplicate: "The host request ID is already in flight.",
} as const;

function configurationKey(environment: Record<string, string>): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        Object.entries(environment).sort(([a], [b]) => a.localeCompare(b)),
      ),
    )
    .digest("hex");
}

function safeLimit(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= maximum
    ? value
    : fallback;
}

/** A single desktop child owns a bounded set of isolated named SDK runtimes. */
export function installSharedEngineHost(
  entryUrl: string | URL,
  options: SharedEngineHostOptions = {},
): { stopAll: () => Promise<void> } | undefined {
  const ipc = options.ipc ?? process;
  if (
    !(
      options.enabled ??
      (isMainThread &&
        process.env.DOOLITTLE_DESKTOP_RUNTIME === "1" &&
        process.env.DOOLITTLE_SHARED_ENGINE === "1")
    ) ||
    typeof ipc.send !== "function"
  )
    return undefined;

  const workerFactory: WorkerFactory =
    options.workerFactory ??
    ((entry, workerOptions) => new Worker(entry, workerOptions));
  const maxWorkers = safeLimit(
    options.maxWorkers,
    SHARED_ENGINE_MAX_WORKERS,
    SHARED_ENGINE_MAX_WORKERS,
  );
  const maxConcurrentStarts = safeLimit(
    options.maxConcurrentStarts,
    SHARED_ENGINE_DEFAULT_CONCURRENT_STARTS,
    SHARED_ENGINE_DEFAULT_CONCURRENT_STARTS,
  );
  const startupTimeoutMs = safeLimit(
    options.startupTimeoutMs,
    SHARED_ENGINE_DEFAULT_BOOT_TIMEOUT_MS,
    300_000,
  );
  const stopTimeoutMs = safeLimit(options.stopTimeoutMs, 5_000, 30_000);
  const residents = new Map<string, Resident>();
  const seenRequests = new Set<string>();
  const startQueue: Resident[] = [];
  let starting = 0;
  let disconnected = false;

  const diagnose = (resident: Resident, code: Resident["diagnosticCode"]) => {
    if (!code || resident.diagnosticCode === code) return;
    resident.diagnosticCode = code;
    try {
      options.onDiagnostic?.({ botId: resident.botId, code });
    } catch {
      // Diagnostics must never affect worker supervision.
    }
    if (process.env.DOOLITTLE_ENGINE_DIAGNOSTICS === "1") {
      process.stderr.write(
        `[doolittle] engine worker ${resident.botId}: ${code}\n`,
      );
    }
  };

  const send = (message: unknown) => {
    if (disconnected) return;
    try {
      ipc.send?.(message);
    } catch {
      disconnected = true;
      void stopAll().catch(() => {});
    }
  };
  const rejectStartup = (resident: Resident) => {
    clearTimeout(resident.startupTimer);
    resident.reject(new Error(STATIC_ERRORS.startup));
  };
  const removeResident = (resident: Resident) => {
    if (residents.get(resident.botId) === resident)
      residents.delete(resident.botId);
    resident.close();
  };
  const drain = () => {
    while (starting < maxConcurrentStarts && startQueue.length) {
      const resident = startQueue.shift();
      if (!resident) break;
      if (resident.stopping) continue;
      starting++;
      try {
        const environment = resident.environment;
        if (!environment) throw new Error("Missing worker environment.");
        const worker = workerFactory(new URL(entryUrl), {
          argv: ["api"],
          env: environment,
          workerData: { doolittleEngineWorker: true, botId: resident.botId },
          stdout: true,
          stderr: true,
        });
        resident.worker = worker;
        resident.environment = undefined;
        // Output belongs to the isolated runtime and must not leak into desktop IPC.
        if (worker instanceof Worker) {
          worker.stdout?.resume();
          worker.stderr?.on("data", (chunk: Buffer | string) => {
            const text = String(chunk);
            if (/ERR_MODULE_NOT_FOUND|Cannot find module/u.test(text)) {
              diagnose(resident, "module-resolution");
            }
          });
          worker.stderr?.resume();
        }
        worker.on("message", (value: unknown) => {
          if (resident.stopping) return;
          if (
            !isRecord(value) ||
            value.protocol !== ENGINE_WORKER_PROTOCOL ||
            !boundedMessage(value, MAX_HOST_MESSAGE_BYTES + 1_000)
          )
            return;
          if (value.type === "ready") {
            if (
              !resident.stopping &&
              isEngineReady(value.ready, resident.botId)
            ) {
              clearTimeout(resident.startupTimer);
              resident.resolve(value.ready);
            }
            return;
          }
          if (
            value.type !== "host-message" ||
            !isWorkerHostRequest(value.message)
          )
            return;
          const message: Record<string, unknown> = {
            ...value.message,
            botId: resident.botId,
          };
          const id = message.id as string;
          const sequence = message.sequence as number;
          const pending = resident.pendingHostRequests.get(id);
          if (message.cancel === true) {
            if (!pending || pending.sequence !== sequence) return;
            resident.pendingHostRequests.delete(id);
          } else if (message.ack === true) {
            if (!pending || pending.sequence !== sequence || !pending.delivered)
              return;
            resident.pendingHostRequests.delete(id);
          } else {
            if (sequence <= resident.lastSequence) return;
            resident.lastSequence = sequence;
            const isClaim = message.operation === "execution.claim";
            const activeClaims = [
              ...resident.pendingHostRequests.values(),
            ].filter((entry) => entry.isClaim).length;
            const error = pending
              ? STATIC_ERRORS.duplicate
              : resident.pendingHostRequests.size >= 32 ||
                  (isClaim && activeClaims >= 16)
                ? STATIC_ERRORS.quota
                : undefined;
            if (error) {
              try {
                worker.postMessage({
                  protocol: ENGINE_WORKER_PROTOCOL,
                  type: "host-message",
                  message: {
                    protocol: "doolittle-worker-host-v1",
                    id,
                    sequence,
                    botId: resident.botId,
                    ok: false,
                    error,
                  },
                });
              } catch {
                // A dying worker is cleaned up by its exit listener.
              }
              return;
            }
            resident.pendingHostRequests.set(id, {
              sequence,
              delivered: false,
              isClaim,
            });
          }
          send({
            protocol: ENGINE_HOST_PROTOCOL,
            botId: resident.botId,
            message,
          });
        });
        worker.on("error", (error: Error) => {
          diagnose(
            resident,
            /ERR_MODULE_NOT_FOUND|Cannot find module/u.test(error.message)
              ? "module-resolution"
              : "worker-error",
          );
          rejectStartup(resident);
          void stop(resident).catch(() => {});
        });
        worker.on("exit", () => {
          if (resident.exited) return;
          resident.exited = true;
          if (!resident.stopping && !resident.diagnosticCode)
            diagnose(resident, "worker-exit");
          if (!resident.requestedStop && !disconnected) {
            send({
              protocol: ENGINE_PROTOCOL,
              event: "bot-exit",
              botId: resident.botId,
            });
          }
          rejectStartup(resident);
          removeResident(resident);
        });
        resident.startupTimer = setTimeout(() => {
          rejectStartup(resident);
          void stop(resident).catch(() => {});
        }, startupTimeoutMs);
      } catch {
        rejectStartup(resident);
        removeResident(resident);
      } finally {
        // Bootstrap is limited until the worker reports ready or dies.
        void resident.ready
          .finally(() => {
            starting--;
            drain();
          })
          .catch(() => {});
      }
    }
  };

  const stop = async (
    resident: Resident,
    requestedStop = false,
  ): Promise<void> => {
    if (requestedStop) resident.requestedStop = true;
    if (resident.stopping) return resident.stopPromise ?? resident.closed;
    resident.stopping = true;
    rejectStartup(resident);
    if (!resident.worker) {
      const index = startQueue.indexOf(resident);
      if (index !== -1) startQueue.splice(index, 1);
      removeResident(resident);
      return;
    }
    try {
      resident.worker.postMessage({
        protocol: ENGINE_WORKER_PROTOCOL,
        type: "shutdown",
      });
    } catch {
      // A failed post still gets a bounded termination attempt below.
    }
    resident.stopPromise = new Promise<void>((resolve, reject) => {
      let killDeadline: ReturnType<typeof setTimeout> | undefined;
      const deadline = setTimeout(() => {
        killDeadline = setTimeout(
          () => reject(new Error(STATIC_ERRORS.unavailable)),
          1_000,
        );
        void resident.worker?.terminate().then(
          () => resident.closed.then(resolve),
          () => reject(new Error(STATIC_ERRORS.unavailable)),
        );
      }, stopTimeoutMs);
      void resident.closed.then(() => {
        clearTimeout(deadline);
        clearTimeout(killDeadline);
        resolve();
      });
    });
    return resident.stopPromise;
  };

  const stopAll = async (): Promise<void> => {
    const outcomes = await Promise.allSettled(
      [...residents.values()].map((resident) => stop(resident, true)),
    );
    if (outcomes.some((outcome) => outcome.status === "rejected")) {
      throw new Error(STATIC_ERRORS.unavailable);
    }
  };

  const start = (request: EngineRequest): Promise<EngineReady> => {
    const key = configurationKey(request.environment ?? {});
    const existing = residents.get(request.botId);
    if (existing) {
      if (existing.stopping)
        return Promise.reject(new Error(STATIC_ERRORS.stopped));
      if (existing.environmentKey !== key) {
        return Promise.reject(new Error(STATIC_ERRORS.configuration));
      }
      return existing.ready;
    }
    if (residents.size >= maxWorkers) {
      return Promise.reject(new Error(STATIC_ERRORS.capacity));
    }
    let resolve!: (ready: EngineReady) => void;
    let reject!: (error: Error) => void;
    const ready = new Promise<EngineReady>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    let close!: () => void;
    const closed = new Promise<void>((done) => {
      close = done;
    });
    const resident: Resident = {
      botId: request.botId,
      environmentKey: key,
      environment: request.environment,
      ready,
      resolve,
      reject,
      closed,
      close,
      stopping: false,
      requestedStop: false,
      exited: false,
      lastSequence: 0,
      pendingHostRequests: new Map(),
    };
    residents.set(request.botId, resident);
    startQueue.push(resident);
    drain();
    return ready;
  };

  ipc.on("message", (value: unknown) => {
    if (!isRecord(value)) return;
    if (value.protocol === ENGINE_HOST_PROTOCOL) {
      if (
        !BOT_ID_PATTERN.test(String(value.botId)) ||
        !isWorkerHostResponse(value.message) ||
        !boundedMessage(value, MAX_HOST_MESSAGE_BYTES + 1_000)
      )
        return;
      const resident = residents.get(value.botId as string);
      if (!resident?.worker || resident.stopping) return;
      const id = value.message.id as string;
      const pending = resident.pendingHostRequests.get(id);
      if (
        !pending ||
        pending.sequence !== value.message.sequence ||
        pending.delivered
      )
        return;
      pending.delivered = true;
      try {
        resident.worker.postMessage({
          protocol: ENGINE_WORKER_PROTOCOL,
          type: "host-message",
          message: { ...value.message, botId: resident.botId },
        });
      } catch {
        // The exit listener owns cleanup; stale responses are dropped.
      }
      return;
    }
    if (value.protocol !== ENGINE_PROTOCOL) return;
    const id =
      typeof value.id === "string" && UUID_PATTERN.test(value.id)
        ? value.id
        : null;
    if (!id || seenRequests.has(id)) return;
    seenRequests.add(id);
    if (seenRequests.size > 2048) {
      const oldest = seenRequests.values().next().value;
      if (oldest) seenRequests.delete(oldest);
    }
    if (!isEngineRequest(value)) {
      send({
        protocol: ENGINE_PROTOCOL,
        id,
        ok: false,
        error: STATIC_ERRORS.invalid,
      });
      return;
    }
    void (async () => {
      if (value.operation === "start") return start(value);
      const resident = residents.get(value.botId);
      if (value.operation === "stop-all") await stopAll();
      else if (resident) await stop(resident, true);
      return undefined;
    })().then(
      (result) => send({ protocol: ENGINE_PROTOCOL, id, ok: true, result }),
      (error: unknown) =>
        send({
          protocol: ENGINE_PROTOCOL,
          id,
          ok: false,
          error:
            error instanceof Error &&
            Object.values(STATIC_ERRORS).includes(error.message as never)
              ? error.message
              : STATIC_ERRORS.startup,
        }),
    );
  });
  ipc.on("disconnect", () => {
    disconnected = true;
    void stopAll().catch(() => {});
  });
  return { stopAll };
}
