import type { ChildProcess } from "node:child_process";

const PROTOCOL = "doolittle-worker-host-v1";
const REQUEST_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_REQUEST_BYTES = 1_000_000;
const MAX_PENDING = 32;
const MAX_PENDING_CLAIMS = 16;
const RECEIPT_TIMEOUT_MS = 55_000;

export interface WorkerHostRequest {
  operation:
    | "codex.auth"
    | "claude.invoke"
    | "workspace.resolve"
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
  payload: unknown;
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
      });
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
      !isRecord(value) ||
      value.protocol !== PROTOCOL ||
      typeof value.id !== "string" ||
      !REQUEST_ID.test(value.id) ||
      !Number.isSafeInteger(value.sequence) ||
      (value.sequence as number) < 1 ||
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
    if (
      value.operation !== "codex.auth" &&
      value.operation !== "claude.invoke" &&
      value.operation !== "workspace.resolve" &&
      value.operation !== "execution.claim" &&
      value.operation !== "execution.release" &&
      value.operation !== "consult.dispatch" &&
      value.operation !== "consult.wait" &&
      value.operation !== "consult.cancel" &&
      value.operation !== "automation.validate" &&
      value.operation !== "automation.dispatch" &&
      value.operation !== "automation.wait" &&
      value.operation !== "automation.status" &&
      value.operation !== "automation.cancel"
    )
      return;
    let size: number;
    try {
      size = Buffer.byteLength(JSON.stringify(value), "utf8");
    } catch {
      return;
    }
    if (size > MAX_REQUEST_BYTES) return;
    const id = value.id;
    const sequence = value.sequence as number;
    const operation = value.operation as WorkerHostRequest["operation"];
    if (sequence <= lastSequence) {
      rejectRequest(id, sequence);
      return;
    }
    lastSequence = sequence;
    if (
      requests.has(id) ||
      requests.size >= MAX_PENDING ||
      (operation === "execution.claim" &&
        [...requests.values()].filter(
          (entry) => entry.request.operation === "execution.claim",
        ).length >= MAX_PENDING_CLAIMS)
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
            RECEIPT_TIMEOUT_MS,
          );
          try {
            child.send(
              { protocol: PROTOCOL, id, botId, sequence, ok: true, result },
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
            });
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
