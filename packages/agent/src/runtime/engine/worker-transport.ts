import { isMainThread, parentPort, workerData } from "node:worker_threads";
import {
  BOT_ID_PATTERN,
  ENGINE_WORKER_PROTOCOL,
  type EngineReady,
  isRecord,
  isWorkerHostRequest,
  isWorkerHostResponse,
} from "./protocol";

let installed = false;
let stopping = false;

function workerBotId(): string | null {
  if (isMainThread || !parentPort || !isRecord(workerData)) return null;
  if (workerData.doolittleEngineWorker !== true) return null;
  return typeof workerData.botId === "string" &&
    BOT_ID_PATTERN.test(workerData.botId)
    ? workerData.botId
    : null;
}

/** Adapt the existing child-process RPC interface inside a worker isolate. */
export function installEngineWorkerTransport(): boolean {
  const botId = workerBotId();
  const port = parentPort;
  if (!botId || !port) return false;
  if (installed) return true;
  installed = true;
  Object.defineProperty(process, "send", {
    configurable: true,
    value: (message: unknown, callback?: (error: Error | null) => void) => {
      if (!isWorkerHostRequest(message)) {
        callback?.(new Error("Invalid worker host request."));
        return false;
      }
      try {
        port.postMessage({
          protocol: ENGINE_WORKER_PROTOCOL,
          type: "host-message",
          message: { ...message, botId },
        });
        callback?.(null);
        return true;
      } catch {
        callback?.(new Error("The desktop host connection is unavailable."));
        return false;
      }
    },
  });
  port.on("message", (value: unknown) => {
    if (!isRecord(value) || value.protocol !== ENGINE_WORKER_PROTOCOL) return;
    if (value.type === "shutdown") {
      stopping = true;
      process.emit("SIGTERM");
      return;
    }
    if (value.type !== "host-message" || !isWorkerHostResponse(value.message))
      return;
    process.emit("message", { ...value.message, botId });
  });
  port.on("close", () => process.emit("disconnect"));
  return true;
}

/** Called only after the named worker has bound its API listener. */
export function notifyEngineWorkerReady(ready: EngineReady): void {
  const botId = workerBotId();
  if (!botId || !parentPort || ready.botId !== botId) return;
  if (stopping) {
    process.emit("SIGTERM");
    return;
  }
  parentPort.postMessage({
    protocol: ENGINE_WORKER_PROTOCOL,
    type: "ready",
    ready: { ...ready, botId },
  });
}
