/**
 * Worker-to-host wire vocabulary. A valid envelope is not an authorization:
 * transports must attest the bot and hosts must authorize each operation.
 */
export const WORKER_HOST_PROTOCOL = "doolittle-worker-host-v1";
export const WORKER_HOST_MAX_MESSAGE_BYTES = 1_000_000;
export const WORKER_HOST_MAX_PENDING_REQUESTS = 32;
export const WORKER_HOST_MAX_PENDING_EXECUTION_CLAIMS = 16;
export const WORKER_HOST_DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
export const WORKER_HOST_RECEIPT_TIMEOUT_MS = 55_000;

/** Requests are generated with randomUUID; every transport uses its v4 policy. */
export const WORKER_HOST_REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export const WORKER_HOST_BOT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/u;

export const WORKER_HOST_OPERATIONS = [
  "codex.auth",
  "claude.invoke",
  "workspace.resolve",
  "execution.claim",
  "execution.release",
  "consult.dispatch",
  "consult.wait",
  "consult.cancel",
  "automation.validate",
  "automation.dispatch",
  "automation.wait",
  "automation.status",
  "automation.cancel",
] as const;

export type WorkerHostOperation = (typeof WORKER_HOST_OPERATIONS)[number];

/** Operation payloads remain unknown until their domain owner authorizes them. */
export interface WorkerHostRequest {
  operation: WorkerHostOperation;
  payload: unknown;
}

export interface WorkerHostMessageIdentity {
  protocol: typeof WORKER_HOST_PROTOCOL;
  id: string;
  botId: string;
  sequence: number;
}

export interface WorkerHostCallMessage
  extends WorkerHostMessageIdentity,
    WorkerHostRequest {
  cancel?: never;
  ack?: never;
  ok?: never;
}

export interface WorkerHostCancelMessage extends WorkerHostMessageIdentity {
  cancel: true;
  ack?: never;
  operation?: never;
  ok?: never;
}

export interface WorkerHostAcknowledgement extends WorkerHostMessageIdentity {
  ack: true;
  cancel?: never;
  operation?: never;
  ok?: never;
}

export type WorkerHostClientMessage =
  | WorkerHostCallMessage
  | WorkerHostCancelMessage
  | WorkerHostAcknowledgement;

export interface WorkerHostSuccessMessage extends WorkerHostMessageIdentity {
  ok: true;
  result?: unknown;
  code?: never;
  error?: never;
  cancel?: never;
  ack?: never;
  operation?: never;
}

export interface WorkerHostFailureMessage extends WorkerHostMessageIdentity {
  ok: false;
  code?: string;
  error?: string;
  cancel?: never;
  ack?: never;
  operation?: never;
}

export type WorkerHostResponseMessage =
  | WorkerHostSuccessMessage
  | WorkerHostFailureMessage;

const operations: ReadonlySet<string> = new Set(WORKER_HOST_OPERATIONS);
const encoder = new TextEncoder();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const isWorkerHostOperation = (
  value: unknown,
): value is WorkerHostOperation =>
  typeof value === "string" && operations.has(value);

const hasMessageIdentity = (value: Record<string, unknown>): boolean =>
  value.protocol === WORKER_HOST_PROTOCOL &&
  typeof value.id === "string" &&
  WORKER_HOST_REQUEST_ID_PATTERN.test(value.id) &&
  typeof value.botId === "string" &&
  WORKER_HOST_BOT_ID_PATTERN.test(value.botId) &&
  typeof value.sequence === "number" &&
  Number.isSafeInteger(value.sequence) &&
  value.sequence > 0;

/** Structural validation only; it does not attest the sender or reserve a receipt. */
export const isWorkerHostClientMessage = (
  value: unknown,
): value is WorkerHostClientMessage => {
  if (!isRecord(value) || !hasMessageIdentity(value) || value.ok !== undefined)
    return false;
  if (value.cancel === true)
    return value.ack === undefined && value.operation === undefined;
  if (value.ack === true)
    return value.cancel === undefined && value.operation === undefined;
  return (
    value.cancel === undefined &&
    value.ack === undefined &&
    isWorkerHostOperation(value.operation)
  );
};

/** Structural validation only; callers still match their attested bot and sequence. */
export const isWorkerHostResponseMessage = (
  value: unknown,
): value is WorkerHostResponseMessage => {
  if (
    !isRecord(value) ||
    !hasMessageIdentity(value) ||
    value.cancel !== undefined ||
    value.ack !== undefined ||
    value.operation !== undefined
  )
    return false;
  if (value.ok === true)
    return value.code === undefined && value.error === undefined;
  return (
    value.ok === false &&
    (value.code === undefined || typeof value.code === "string") &&
    (value.error === undefined || typeof value.error === "string")
  );
};

/** JSON wire budget, shared by transport boundaries without Node dependencies. */
export const isWorkerHostMessageWithinLimit = (value: unknown): boolean => {
  try {
    const encoded = JSON.stringify(value);
    return (
      typeof encoded === "string" &&
      encoder.encode(encoded).byteLength <= WORKER_HOST_MAX_MESSAGE_BYTES
    );
  } catch {
    return false;
  }
};
