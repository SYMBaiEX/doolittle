import type { ChildProcess } from "node:child_process";

const PROTOCOL = "doolittle-worker-host-v1";
const REQUEST_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_REQUEST_BYTES = 1_000_000;
const MAX_PENDING = 16;

export interface WorkerHostRequest {
  operation:
    | "codex.auth"
    | "claude.invoke"
    | "execution.claim"
    | "execution.release"
    | "consult.dispatch"
    | "consult.wait"
    | "consult.cancel";
  payload: unknown;
}

export type WorkerHostHandler = (
  request: WorkerHostRequest,
  signal: AbortSignal,
) => Promise<unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Bind one child's requests to the identity attested at process launch. */
export function attachWorkerHostRpc(
  child: Pick<ChildProcess, "on" | "removeListener" | "send" | "connected">,
  botId: string,
  handler: WorkerHostHandler,
): () => void {
  let pending = 0;
  let disposed = false;
  const controllers = new Map<string, AbortController>();
  const onMessage = (value: unknown) => {
    if (
      disposed ||
      !isRecord(value) ||
      value.protocol !== PROTOCOL ||
      typeof value.id !== "string" ||
      !REQUEST_ID.test(value.id) ||
      value.botId !== botId
    )
      return;
    if (value.cancel === true) {
      controllers.get(value.id)?.abort();
      return;
    }
    if (
      value.operation !== "codex.auth" &&
      value.operation !== "claude.invoke" &&
      value.operation !== "execution.claim" &&
      value.operation !== "execution.release" &&
      value.operation !== "consult.dispatch" &&
      value.operation !== "consult.wait" &&
      value.operation !== "consult.cancel"
    )
      return;
    if (pending >= MAX_PENDING || controllers.has(value.id)) return;
    let size: number;
    try {
      size = Buffer.byteLength(JSON.stringify(value), "utf8");
    } catch {
      return;
    }
    if (size > MAX_REQUEST_BYTES) return;
    const id = value.id;
    const operation = value.operation as WorkerHostRequest["operation"];
    const controller = new AbortController();
    controllers.set(id, controller);
    pending += 1;
    void Promise.resolve()
      .then(() =>
        handler({ operation, payload: value.payload }, controller.signal),
      )
      .then(
        (result) => {
          if (disposed || !child.connected) return;
          try {
            child.send({ protocol: PROTOCOL, id, botId, ok: true, result });
          } catch {
            /* child exited */
          }
        },
        () => {
          if (disposed || !child.connected) return;
          try {
            child.send({ protocol: PROTOCOL, id, botId, ok: false });
          } catch {
            /* child exited */
          }
        },
      )
      .finally(() => {
        controllers.delete(id);
        pending -= 1;
      });
  };
  child.on("message", onMessage);
  return () => {
    disposed = true;
    for (const controller of controllers.values()) controller.abort();
    controllers.clear();
    child.removeListener("message", onMessage);
  };
}
