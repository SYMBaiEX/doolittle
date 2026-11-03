import { randomUUID } from "node:crypto";
import {
  isWorkerHostMessageWithinLimit,
  isWorkerHostOperation,
  isWorkerHostResponseMessage,
  type WorkerHostAcknowledgement,
  type WorkerHostCallMessage,
  type WorkerHostCancelMessage,
  type WorkerHostOperation,
  WORKER_HOST_BOT_ID_PATTERN,
  WORKER_HOST_DEFAULT_REQUEST_TIMEOUT_MS,
  WORKER_HOST_MAX_PENDING_EXECUTION_CLAIMS,
  WORKER_HOST_MAX_PENDING_REQUESTS,
  WORKER_HOST_PROTOCOL as WORKER_HOST_RPC_PROTOCOL,
} from "@doolittle/contracts/worker-host";
import { readWorkerBotProfile } from "./bot-profile";

export {
  type WorkerHostOperation,
  WORKER_HOST_PROTOCOL as WORKER_HOST_RPC_PROTOCOL,
} from "@doolittle/contracts/worker-host";

interface PendingRequest {
  operation: WorkerHostOperation;
  sequence: number;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  removeAbortListener: () => void;
}

const pending = new Map<string, PendingRequest>();
let lastSequence = 0;
let listening = false;

function hostBotId(): string | null {
  const worker = readWorkerBotProfile();
  if (worker) return worker.id;
  const lead = process.env.DOOLITTLE_HOST_BOT_ID;
  return process.env.DOOLITTLE_DESKTOP_RUNTIME === "1" &&
    typeof lead === "string" &&
    WORKER_HOST_BOT_ID_PATTERN.test(lead)
    ? lead
    : null;
}

function ensureListener(): void {
  if (listening) return;
  listening = true;
  process.on("message", (message: unknown) => {
    if (
      !isWorkerHostResponseMessage(message) ||
      !isWorkerHostMessageWithinLimit(message) ||
      message.botId !== hostBotId()
    ) {
      return;
    }
    const id = message.id;
    const request = pending.get(id);
    if (!request || message.sequence !== request.sequence) {
      // A grant may have raced a local timeout/cancel. The host still owns the
      // receipt until ACK, so explicitly abandon this late successful reply.
      process.send?.({
        protocol: WORKER_HOST_RPC_PROTOCOL,
        id,
        botId: message.botId,
        sequence: message.sequence,
        cancel: true,
      } satisfies WorkerHostCancelMessage);
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
      } satisfies WorkerHostAcknowledgement);
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
  if (!isWorkerHostOperation(operation)) {
    return Promise.reject(
      new Error("The requested host operation is unavailable."),
    );
  }
  const botId = hostBotId();
  if (!botId || typeof process.send !== "function") {
    return Promise.reject(
      new Error("The desktop execution host is unavailable."),
    );
  }
  if (pending.size >= WORKER_HOST_MAX_PENDING_REQUESTS) {
    return Promise.reject(new Error("Too many host requests are in flight."));
  }
  if (
    operation === "execution.claim" &&
    [...pending.values()].filter(
      (request) => request.operation === "execution.claim",
    ).length >= WORKER_HOST_MAX_PENDING_EXECUTION_CLAIMS
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
  const message: WorkerHostCallMessage = {
    protocol: WORKER_HOST_RPC_PROTOCOL,
    id,
    botId,
    sequence,
    operation,
    payload,
  };
  if (!isWorkerHostMessageWithinLimit(message)) {
    return Promise.reject(
      new Error("The host request is not serializable within its wire budget."),
    );
  }
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
      } satisfies WorkerHostCancelMessage);
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
      } satisfies WorkerHostCancelMessage);
      reject(new Error("The approved host request timed out."));
    }, options.timeoutMs ?? WORKER_HOST_DEFAULT_REQUEST_TIMEOUT_MS);
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
      message,
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
