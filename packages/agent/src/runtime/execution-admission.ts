import { AsyncLocalStorage } from "node:async_hooks";
import { requestWorkerHost } from "./bootstrap/worker-host-rpc";

export type ExecutionAdmissionKind = "foreground" | "automatic-acp";

export interface ExecutionLease {
  readonly runId: string;
  readonly sessionId: string;
  readonly active?: boolean;
  release(): Promise<void>;
  yieldFor<T>(
    work: () => Promise<T>,
    options: { deadline: number; signal?: AbortSignal },
  ): Promise<T>;
}

const executionScope = new AsyncLocalStorage<ExecutionLease | null>();

type SdkTaskSpawn = {
  taskId: string;
  parentRunId: string;
  sessionId: string;
  workspacePath: string;
  active: boolean;
};
const sdkTaskSpawnScope = new AsyncLocalStorage<SdkTaskSpawn>();

/** Only the validated task bridge may authorize SDK-generated ACP metadata. */
export async function runWithSdkTaskSpawn<T>(
  input: Omit<SdkTaskSpawn, "active">,
  task: () => Promise<T>,
): Promise<T> {
  const scope = { ...input, active: true };
  try {
    return await sdkTaskSpawnScope.run(scope, task);
  } finally {
    scope.active = false;
  }
}

export function getScopedSdkTaskSpawn(): Readonly<SdkTaskSpawn> | null {
  const scope = sdkTaskSpawnScope.getStore();
  return scope?.active ? scope : null;
}

export function runWithExecutionLease<T>(
  lease: ExecutionLease | null,
  task: () => Promise<T>,
): Promise<T> {
  return executionScope.run(lease, task);
}

export function getScopedExecutionLease(): ExecutionLease | null {
  const lease = executionScope.getStore();
  return lease?.active === false ? null : (lease ?? null);
}

export class ExecutionAdmissionLimitError extends Error {
  constructor(
    readonly reason:
      | "total_limit"
      | "automatic_acp_limit"
      | "bot_limit"
      | "mutation_conflict"
      | "run_exists"
      | "queue_full"
      | "queue_timeout"
      | "bot_stopped",
  ) {
    super(
      reason === "automatic_acp_limit"
        ? "Automatic ACP executions are at capacity. Try again when one finishes."
        : reason === "mutation_conflict"
          ? "A mutation-capable execution already owns this workspace. Try again when it finishes."
          : reason === "total_limit"
            ? "The execution fleet is at capacity. Try again when one finishes."
            : reason === "bot_limit"
              ? "This bot has reached its active execution limit."
              : reason === "queue_full"
                ? "The execution waiting queue is full. Try again shortly."
                : reason === "queue_timeout"
                  ? "Execution admission timed out while waiting for capacity."
                  : reason === "bot_stopped"
                    ? "This bot stopped while waiting for execution admission."
                    : "This execution is already active.",
    );
    this.name = "ExecutionAdmissionLimitError";
  }
}

const RUN_ID = /^[A-Za-z0-9:_-]{1,128}$/u;
const LEASE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
// Host admission permits up to 120s of queueing; leave delivery/cancel margin.
const EXECUTION_CLAIM_RPC_TIMEOUT_MS = 150_000;

/** In desktop mode the host owns capacity. A missing IPC channel is failure, not fallback. */
export async function acquireExecutionLease(input: {
  runId: string;
  sessionId: string;
  kind: ExecutionAdmissionKind;
  parentRunId?: string;
  signal?: AbortSignal;
}): Promise<ExecutionLease | null> {
  if (process.env.DOOLITTLE_DESKTOP_RUNTIME !== "1") return null;
  if (!RUN_ID.test(input.runId)) {
    throw new Error("Execution run identity is invalid.");
  }
  const claim = (
    signal = input.signal,
    timeoutMs = EXECUTION_CLAIM_RPC_TIMEOUT_MS,
  ) =>
    requestWorkerHost(
      "execution.claim",
      {
        runId: input.runId,
        sessionId: input.sessionId,
        kind: input.kind,
        ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
      },
      { timeoutMs, signal },
    );
  const result = await claim();
  let leaseId: string | null = parseAdmissionDecision(result);
  let lastLeaseId = leaseId;
  let yielded = false;
  let closed = false;
  const release = async (yielding = false) => {
    if (closed && !yielding) return;
    if (!yielding) closed = true;
    if (!leaseId && yielding) return;
    const current = leaseId ?? lastLeaseId;
    if (!current) return;
    leaseId = null;
    try {
      await requestWorkerHost(
        "execution.release",
        {
          runId: input.runId,
          leaseId: current,
          ...(yielding ? { yielding: true } : {}),
        },
        { timeoutMs: 2_000 },
      );
    } catch {
      // Child disconnect clears its leases. Never mask a completed turn.
    }
  };
  if (input.signal?.aborted) {
    await release();
    input.signal.throwIfAborted();
  }
  return {
    runId: input.runId,
    sessionId: input.sessionId,
    get active() {
      return !closed;
    },
    release: () => release(),
    async yieldFor<T>(
      work: () => Promise<T>,
      options: { deadline: number; signal?: AbortSignal },
    ): Promise<T> {
      if (yielded || !leaseId || closed)
        throw new Error("Execution is not holding an admission lease.");
      yielded = true;
      await release(true);
      let outcome: { ok: true; value: T } | { ok: false; error: unknown };
      try {
        outcome = { ok: true, value: await work() };
      } catch (error) {
        outcome = { ok: false, error };
      }
      let reacquireError: unknown;
      try {
        const remainingMs = options.deadline - Date.now();
        if (remainingMs <= 0) {
          throw new Error(
            "Execution could not reacquire its admission and mutation lease before the deadline.",
          );
        }
        leaseId = parseAdmissionDecision(
          await claim(
            options.signal,
            Math.min(EXECUTION_CLAIM_RPC_TIMEOUT_MS, remainingMs),
          ),
        );
        lastLeaseId = leaseId;
        options.signal?.throwIfAborted();
      } catch (error) {
        reacquireError = error;
      }
      yielded = false;
      if (reacquireError) {
        await release();
        throw reacquireError;
      }
      if (!outcome.ok) throw outcome.error;
      return outcome.value;
    },
  };
}

function parseAdmissionDecision(result: unknown): string {
  if (!result || typeof result !== "object") {
    throw new Error("Global execution admission is unavailable.");
  }
  const decision = result as {
    accepted?: unknown;
    reason?: unknown;
    leaseId?: unknown;
  };
  if (decision.accepted === false) {
    if (
      decision.reason === "total_limit" ||
      decision.reason === "automatic_acp_limit" ||
      decision.reason === "bot_limit" ||
      decision.reason === "mutation_conflict" ||
      decision.reason === "run_exists" ||
      decision.reason === "queue_full" ||
      decision.reason === "queue_timeout" ||
      decision.reason === "bot_stopped"
    ) {
      throw new ExecutionAdmissionLimitError(decision.reason);
    }
    throw new Error("Global execution admission is unavailable.");
  }
  if (
    decision.accepted !== true ||
    typeof decision.leaseId !== "string" ||
    !LEASE_ID.test(decision.leaseId)
  ) {
    throw new Error("Global execution admission receipt is invalid.");
  }
  return decision.leaseId;
}
