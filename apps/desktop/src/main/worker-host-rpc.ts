import type { ChildProcess } from "node:child_process";
import {
  isWorkerHostClientMessage,
  isWorkerHostMessageWithinLimit,
  type WorkerHostRequest,
  type WorkerHostResponseMessage,
  WORKER_HOST_MAX_PENDING_EXECUTION_CLAIMS,
  WORKER_HOST_MAX_PENDING_REQUESTS,
  WORKER_HOST_PROTOCOL as PROTOCOL,
  WORKER_HOST_RECEIPT_TIMEOUT_MS,
} from "@doolittle/contracts/worker-host";

export type { WorkerHostRequest } from "@doolittle/contracts/worker-host";

export type WorkerHostHandler = (
  request: WorkerHostRequest,
  signal: AbortSignal,
) => Promise<unknown>;

export interface WorkerHostRpcOptions {
  /** Roll back a successful result that the child never acknowledged. */
  onAbandonedResult?: (request: WorkerHostRequest, result: unknown) => void;
}

interface PendingRequest {
  sequence: number;
  request: WorkerHostRequest;
  controller: AbortController;
  resultKnown: boolean;
  result?: unknown;
  abandoned: boolean;
  acknowledged: boolean;
  rolledBack: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

/** Bind one child's requests to the identity attested at process launch. */
export function attachWorkerHostRpc(
  child: Pick<ChildProcess, "on" | "removeListener" | "send" | "connected">,
  botId: string,
  handler: WorkerHostHandler,
  options: WorkerHostRpcOptions = {},
): () => void {
  let disposed = false;
  const requests = new Map<string, PendingRequest>();
  let lastSequence = 0;
  const rejectRequest = (id: string, sequence: number) => {
    if (!child.connected) return;
    try {
      child.send({
        protocol: PROTOCOL,
        id,
        botId,
        sequence,
        ok: false,
        code: "host_backpressure",
      } satisfies WorkerHostResponseMessage);
    } catch {
      // Child exit releases its bot's leases.
    }
  };
  const finish = (id: string, entry: PendingRequest) => {
    if (requests.get(id) === entry) requests.delete(id);
    if (entry.timer) clearTimeout(entry.timer);
  };
  const rollback = (entry: PendingRequest) => {
    if (!entry.resultKnown || entry.rolledBack) return;
    entry.rolledBack = true;
    try {
      options.onAbandonedResult?.(entry.request, entry.result);
    } catch {
      // Rollback is best-effort; child exit also releases its bot's leases.
    }
  };
  const abandon = (id: string, entry: PendingRequest) => {
    if (entry.acknowledged || entry.abandoned) return;
    entry.abandoned = true;
    entry.controller.abort();
    rollback(entry);
    finish(id, entry);
  };
  const onMessage = (value: unknown) => {
    if (
      disposed ||
      !isWorkerHostClientMessage(value) ||
      !isWorkerHostMessageWithinLimit(value) ||
      value.botId !== botId
    )
      return;
    if (value.cancel === true) {
      const entry = requests.get(value.id);
      if (entry && entry.sequence === value.sequence) abandon(value.id, entry);
      return;
    }
    if (value.ack === true) {
      const entry = requests.get(value.id);
      if (
        entry &&
        entry.sequence === value.sequence &&
        entry.resultKnown &&
        !entry.abandoned
      ) {
        entry.acknowledged = true;
        finish(value.id, entry);
      }
      return;
    }
    const id = value.id;
    const sequence = value.sequence;
    const operation = value.operation;
    if (sequence <= lastSequence) {
      rejectRequest(id, sequence);
      return;
    }
    lastSequence = sequence;
    if (
      requests.has(id) ||
      requests.size >= WORKER_HOST_MAX_PENDING_REQUESTS ||
      (operation === "execution.claim" &&
        [...requests.values()].filter(
          (entry) => entry.request.operation === "execution.claim",
        ).length >= WORKER_HOST_MAX_PENDING_EXECUTION_CLAIMS)
    ) {
      rejectRequest(id, sequence);
      return;
    }
    const request = { operation, payload: value.payload };
    const entry: PendingRequest = {
      sequence,
      request,
      controller: new AbortController(),
      resultKnown: false,
      abandoned: false,
      acknowledged: false,
      rolledBack: false,
    };
    requests.set(id, entry);
    void Promise.resolve()
      .then(() => handler(request, entry.controller.signal))
      .then(
        (result) => {
          entry.resultKnown = true;
          entry.result = result;
          if (entry.abandoned || disposed || !child.connected) {
            abandon(id, entry);
            rollback(entry);
            return;
          }
          entry.timer = setTimeout(
            () => abandon(id, entry),
            WORKER_HOST_RECEIPT_TIMEOUT_MS,
          );
          try {
            child.send(
              {
                protocol: PROTOCOL,
                id,
                botId,
                sequence,
                ok: true,
                result,
              } satisfies WorkerHostResponseMessage,
              (error) => {
                if (error) abandon(id, entry);
              },
            );
          } catch {
            abandon(id, entry);
          }
        },
        () => {
          if (entry.abandoned || disposed || !child.connected) {
            finish(id, entry);
            return;
          }
          try {
            child.send({
              protocol: PROTOCOL,
              id,
              botId,
              sequence,
              ok: false,
              ...(operation.startsWith("automation.")
                ? {
                    code: "automation_host_failure",
                    error:
                      "Named automation approval, grant, or worker is unavailable. Review the target and saved fire identity before retrying; uncertain submissions are never replayed.",
                  }
                : {}),
            } satisfies WorkerHostResponseMessage);
          } catch {
            /* child exited */
          }
          finish(id, entry);
        },
      );
  };
  child.on("message", onMessage);
  return () => {
    disposed = true;
    for (const [id, entry] of requests) abandon(id, entry);
    child.removeListener("message", onMessage);
  };
}
