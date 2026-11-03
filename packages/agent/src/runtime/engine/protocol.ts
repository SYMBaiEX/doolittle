import {
  isWorkerHostClientMessage,
  isWorkerHostMessageWithinLimit,
  isWorkerHostResponseMessage,
  type WorkerHostClientMessage,
  type WorkerHostResponseMessage,
  WORKER_HOST_BOT_ID_PATTERN,
} from "@doolittle/contracts/worker-host";

export {
  WORKER_HOST_MAX_MESSAGE_BYTES as MAX_HOST_MESSAGE_BYTES,
  WORKER_HOST_PROTOCOL,
} from "@doolittle/contracts/worker-host";

export const ENGINE_PROTOCOL = "doolittle-engine-v1";
export const ENGINE_HOST_PROTOCOL = "doolittle-engine-host-v1";
export const ENGINE_WORKER_PROTOCOL = "doolittle-engine-worker-v1";

export const BOT_ID_PATTERN = WORKER_HOST_BOT_ID_PATTERN;
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export interface EngineReady {
  url: string;
  agentId: string;
  name: string;
  botId: string;
}

export type EngineOperation = "start" | "stop" | "stop-all";

export interface EngineRequest {
  protocol: typeof ENGINE_PROTOCOL;
  id: string;
  operation: EngineOperation;
  botId: string;
  environment?: Record<string, string>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function boundedMessage(value: unknown, limit = 256_000): boolean {
  try {
    const encoded = JSON.stringify(value);
    return (
      typeof encoded === "string" && Buffer.byteLength(encoded, "utf8") <= limit
    );
  } catch {
    return false;
  }
}

/** Validate the canonical wire envelope and its transport budget. */
export function isWorkerHostRequest(
  value: unknown,
): value is WorkerHostClientMessage {
  return (
    isWorkerHostClientMessage(value) && isWorkerHostMessageWithinLimit(value)
  );
}

export function isWorkerHostResponse(
  value: unknown,
): value is WorkerHostResponseMessage {
  return (
    isWorkerHostResponseMessage(value) && isWorkerHostMessageWithinLimit(value)
  );
}

export function isEngineRequest(value: unknown): value is EngineRequest {
  if (!isRecord(value) || value.protocol !== ENGINE_PROTOCOL) return false;
  if (!UUID_PATTERN.test(String(value.id))) return false;
  if (!BOT_ID_PATTERN.test(String(value.botId))) return false;
  if (!["start", "stop", "stop-all"].includes(String(value.operation))) {
    return false;
  }
  if (value.operation === "start") {
    if (!isRecord(value.environment)) return false;
    if (!boundedMessage(value.environment, 64_000)) return false;
    for (const [key, entry] of Object.entries(value.environment)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key) || typeof entry !== "string") {
        return false;
      }
    }
  } else if (value.environment !== undefined) {
    return false;
  }
  return boundedMessage(value, 65_000);
}

export function isEngineReady(
  value: unknown,
  botId: string,
): value is EngineReady {
  return (
    isRecord(value) &&
    value.botId === botId &&
    typeof value.url === "string" &&
    /^http:\/\/127\.0\.0\.1:\d{1,5}$/u.test(value.url) &&
    typeof value.agentId === "string" &&
    UUID_PATTERN.test(value.agentId) &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    value.name.length <= 256
  );
}
