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
  | "consult.cancel"
  | "automation.validate"
  | "automation.dispatch"
  | "automation.wait"
  | "automation.status"
  | "automation.cancel";

interface PendingRequest {
  operation: WorkerHostOperation;
  sequence: number;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  removeAbortListener: () => void;
}

const pending = new Map<string, PendingRequest>();
const MAX_PENDING = 32;
const MAX_PENDING_CLAIMS = 16;
let lastSequence = 0;
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
    if (!request || message.sequence !== request.sequence) {
      // A grant may have raced a local timeout/cancel. The host still owns the
      // receipt until ACK, so explicitly abandon this late successful reply.
      if (
        (message.ok === true || message.ok === false) &&
        Number.isSafeInteger(message.sequence) &&
        (message.sequence as number) > 0
      ) {
        process.send?.({
          protocol: WORKER_HOST_RPC_PROTOCOL,
          id,
          botId: message.botId,
          sequence: message.sequence,
          cancel: true,
        });
      }
      return;
    }
    pending.delete(id);
    clearTimeout(request.timeout);
    request.removeAbortListener();
    try {
      process.send?.({
        protocol: WORKER_HOST_RPC_PROTOCOL,
        id,
        botId: message.botId,
        sequence: request.sequence,
        ack: true,
      });
    } catch {
      request.reject(new Error("The approved host connection is unavailable."));
      return;
    }
    if (message.ok === true) {
      request.resolve(message.result);
    } else {
      request.reject(
        new Error(
          message.code === "automation_host_failure" &&
            typeof message.error === "string" &&
            message.error.length <= 512
            ? message.error
            : message.code === "host_backpressure"
              ? "The desktop host has too many execution requests in flight."
              : "The approved host connection is unavailable.",
        ),
      );
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
  if (pending.size >= MAX_PENDING) {
    return Promise.reject(new Error("Too many host requests are in flight."));
  }
  if (
    operation === "execution.claim" &&
    [...pending.values()].filter(
      (request) => request.operation === "execution.claim",
    ).length >= MAX_PENDING_CLAIMS
  ) {
    return Promise.reject(
      new Error("Too many execution claims are in flight."),
    );
  }
  if (lastSequence >= Number.MAX_SAFE_INTEGER) {
    return Promise.reject(
      new Error("The host request sequence is exhausted; restart this bot."),
    );
  }
  ensureListener();
  if (options.signal?.aborted) {
    return Promise.reject(
      new DOMException("The host request was cancelled.", "AbortError"),
    );
  }
  const id = randomUUID();
  const sequence = ++lastSequence;
  return new Promise<unknown>((resolve, reject) => {
    const sendCancel = () => {
      if (!pending.has(id)) return;
      pending.delete(id);
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", sendCancel);
      process.send?.({
        protocol: WORKER_HOST_RPC_PROTOCOL,
        id,
        botId,
        sequence,
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
        sequence,
        cancel: true,
      });
      reject(new Error("The approved host request timed out."));
    }, options.timeoutMs ?? 30_000);
    pending.set(id, {
      operation,
      sequence,
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
        sequence,
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
