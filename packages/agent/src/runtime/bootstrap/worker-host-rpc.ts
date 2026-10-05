import { randomUUID } from "node:crypto";
import { readWorkerBotProfile } from "./bot-profile";

export const WORKER_HOST_RPC_PROTOCOL = "doolittle-worker-host-v1";

export type WorkerHostOperation =
  | "codex.auth"
  | "claude.invoke"
  | "execution.claim"
  | "execution.release"
  | "consult.dispatch"
  | "consult.wait"
  | "consult.cancel";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  removeAbortListener: () => void;
}

const pending = new Map<string, PendingRequest>();
let listening = false;
const BOT_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/u;

function hostBotId(): string | null {
  const worker = readWorkerBotProfile();
  if (worker) return worker.id;
  const lead = process.env.DOOLITTLE_HOST_BOT_ID;
  return process.env.DOOLITTLE_DESKTOP_RUNTIME === "1" &&
    typeof lead === "string" &&
    BOT_ID.test(lead)
    ? lead
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function ensureListener(): void {
  if (listening) return;
  listening = true;
  process.on("message", (message: unknown) => {
    if (
      !isRecord(message) ||
      message.protocol !== WORKER_HOST_RPC_PROTOCOL ||
      message.botId !== hostBotId()
    ) {
      return;
    }
    const id = message.id;
    if (typeof id !== "string") return;
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    clearTimeout(request.timeout);
    request.removeAbortListener();
    if (message.ok === true) {
      request.resolve(message.result);
    } else {
      request.reject(new Error("The approved host connection is unavailable."));
    }
  });
  process.on("disconnect", () => {
    for (const [id, request] of pending) {
      pending.delete(id);
      clearTimeout(request.timeout);
      request.removeAbortListener();
      request.reject(new Error("The desktop host disconnected."));
    }
  });
}

/** Desktop-runtime request; the child cannot choose its host identity. */
export function requestWorkerHost(
  operation: WorkerHostOperation,
  payload: unknown,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<unknown> {
  const botId = hostBotId();
  if (!botId || typeof process.send !== "function") {
    return Promise.reject(
      new Error("The desktop execution host is unavailable."),
    );
  }
  if (pending.size >= 16) {
    return Promise.reject(new Error("Too many host requests are in flight."));
  }
  ensureListener();
  if (options.signal?.aborted) {
    return Promise.reject(
      new DOMException("The host request was cancelled.", "AbortError"),
    );
  }
  const id = randomUUID();
  return new Promise<unknown>((resolve, reject) => {
    const sendCancel = () => {
      if (!pending.has(id)) return;
      pending.delete(id);
      clearTimeout(timeout);
      process.send?.({
        protocol: WORKER_HOST_RPC_PROTOCOL,
        id,
        botId,
        cancel: true,
      });
      reject(new DOMException("The host request was cancelled.", "AbortError"));
    };
    const timeout = setTimeout(() => {
      pending.delete(id);
      options.signal?.removeEventListener("abort", sendCancel);
      process.send?.({
        protocol: WORKER_HOST_RPC_PROTOCOL,
        id,
        botId,
        cancel: true,
      });
      reject(new Error("The approved host request timed out."));
    }, options.timeoutMs ?? 30_000);
    pending.set(id, {
      resolve,
      reject,
      timeout,
      removeAbortListener: () =>
        options.signal?.removeEventListener("abort", sendCancel),
    });
    options.signal?.addEventListener("abort", sendCancel, { once: true });
    if (options.signal?.aborted) {
      sendCancel();
      return;
    }
    process.send?.(
      {
        protocol: WORKER_HOST_RPC_PROTOCOL,
        id,
        botId,
        operation,
        payload,
      },
      (error) => {
        if (!error) return;
        const request = pending.get(id);
        if (!request) return;
        pending.delete(id);
        clearTimeout(request.timeout);
        request.removeAbortListener();
        reject(new Error("The approved host connection is unavailable."));
      },
    );
  });
}
