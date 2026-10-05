import { AsyncLocalStorage } from "node:async_hooks";
import { requestWorkerHost } from "./bootstrap/worker-host-rpc";

export type ExecutionAdmissionKind = "foreground" | "automatic-acp";

export interface ExecutionLease {
  readonly runId: string;
  release(): Promise<void>;
  yieldFor<T>(
    work: () => Promise<T>,
    options: { deadline: number; signal?: AbortSignal },
  ): Promise<T>;
}

const executionScope = new AsyncLocalStorage<ExecutionLease | null>();

export function runWithExecutionLease<T>(
  lease: ExecutionLease | null,
  task: () => Promise<T>,
): Promise<T> {
  return executionScope.run(lease, task);
}

export function getScopedExecutionLease(): ExecutionLease | null {
  return executionScope.getStore() ?? null;
}

export class ExecutionAdmissionLimitError extends Error {
  constructor(
    readonly reason:
      | "total_limit"
      | "automatic_acp_limit"
      | "mutation_conflict"
      | "run_exists",
  ) {
    super(
      reason === "automatic_acp_limit"
        ? "Two automatic ACP executions are already active. Try again when one finishes."
        : reason === "mutation_conflict"
          ? "A mutation-capable execution already owns this workspace. Try again when it finishes."
          : reason === "total_limit"
            ? "Four executions are already active. Try again when one finishes."
            : "This execution is already active.",
    );
    this.name = "ExecutionAdmissionLimitError";
  }
}

const RUN_ID = /^[A-Za-z0-9:_-]{1,128}$/u;
const LEASE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** In desktop mode the host owns capacity. A missing IPC channel is failure, not fallback. */
export async function acquireExecutionLease(input: {
  runId: string;
  sessionId: string;
  kind: ExecutionAdmissionKind;
  signal?: AbortSignal;
}): Promise<ExecutionLease | null> {
  if (process.env.DOOLITTLE_DESKTOP_RUNTIME !== "1") return null;
  if (!RUN_ID.test(input.runId)) {
    throw new Error("Execution run identity is invalid.");
  }
  const claim = (signal = input.signal) =>
    requestWorkerHost(
      "execution.claim",
      { runId: input.runId, sessionId: input.sessionId, kind: input.kind },
      { timeoutMs: 5_000, signal },
    );
  const result = await claim();
  let leaseId: string | null = parseAdmissionDecision(result);
  let yielded = false;
  const release = async () => {
    if (!leaseId) return;
    const current = leaseId;
    leaseId = null;
    try {
      await requestWorkerHost(
        "execution.release",
        { runId: input.runId, leaseId: current },
        { timeoutMs: 2_000 },
      );
    } catch {
      // Child disconnect clears its leases. Never mask a completed turn.
    }
  };
  return {
    runId: input.runId,
    release,
    async yieldFor<T>(
      work: () => Promise<T>,
      options: { deadline: number; signal?: AbortSignal },
    ): Promise<T> {
      if (yielded || !leaseId)
        throw new Error("Execution is not holding an admission lease.");
      yielded = true;
      await release();
      let outcome: { ok: true; value: T } | { ok: false; error: unknown };
      try {
        outcome = { ok: true, value: await work() };
      } catch (error) {
        outcome = { ok: false, error };
      }
      let reacquireError: unknown;
      try {
        while (!options.signal?.aborted && Date.now() < options.deadline) {
          try {
            leaseId = parseAdmissionDecision(await claim(options.signal));
            break;
          } catch (error) {
            if (!(error instanceof ExecutionAdmissionLimitError)) throw error;
            await new Promise<void>((resolve) => setTimeout(resolve, 100));
          }
        }
        if (!leaseId && !options.signal?.aborted) {
          throw new Error(
            "Execution could not reacquire its admission and mutation lease before the deadline.",
          );
        }
        options.signal?.throwIfAborted();
      } catch (error) {
        reacquireError = error;
      }
      yielded = false;
      if (reacquireError) throw reacquireError;
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
      decision.reason === "mutation_conflict" ||
      decision.reason === "run_exists"
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
