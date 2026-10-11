import { randomUUID } from "node:crypto";
import { availableParallelism } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";

export type ExecutionAdmissionKind = "foreground" | "automatic-acp";
export interface ExecutionAdmissionLease {
  id: string;
  botId: string;
  runId: string;
  sessionId: string;
  kind: ExecutionAdmissionKind;
  mutationRoot?: string;
  admittedAt: string;
}
export type ExecutionAdmissionResult =
  | { accepted: true; leaseId: string }
  | {
      accepted: false;
      reason:
        | "total_limit"
        | "automatic_acp_limit"
        | "bot_limit"
        | "mutation_conflict"
        | "run_exists"
        | "queue_full"
        | "queue_timeout"
        | "bot_stopped";
    };
type ClaimInput = Omit<ExecutionAdmissionLease, "id" | "admittedAt">;
export interface DesktopExecutionAdmissionOptions {
  maxConcurrent?: number;
  maxAutomaticAcp?: number;
  maxPerBotActive?: number;
  maxPending?: number;
  maxPendingPerBot?: number;
  queueTimeoutMs?: number;
}
interface PendingClaim {
  input: ClaimInput;
  resolve: (result: ExecutionAdmissionResult) => void;
  timer: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  onAbort: () => void;
}
function rootsOverlap(left: string, right: string): boolean {
  const a = relative(left, right);
  const b = relative(right, left);
  return (
    a === "" ||
    b === "" ||
    (!a.startsWith("..") && !isAbsolute(a)) ||
    (!b.startsWith("..") && !isAbsolute(b))
  );
}
function boundedInteger(value: number, name: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
    throw new RangeError(`${name} must be an integer from 1 to ${maximum}.`);
  return value;
}
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}
function validatedRoot(root: string | undefined): string | undefined {
  if (root === undefined) return undefined;
  if (!isAbsolute(root) || hasControlCharacter(root) || resolve(root) !== root)
    throw new TypeError(
      "Mutation root must be an absolute, normalized host path.",
    );
  return root;
}

/**
 * Process-wide admission; a detached UI subscriber never frees an execution.
 * The host must realpath mutation roots before calling claim() or acquire().
 * Admission only compares already authorized paths and never reads the filesystem.
 */
export class DesktopExecutionAdmission {
  private readonly leases = new Map<string, ExecutionAdmissionLease>();
  private readonly pending = new Map<string, PendingClaim[]>();
  private readonly botOrder: string[] = [];
  private readonly maxConcurrent: number;
  private readonly maxAutomaticAcp: number;
  private readonly maxPerBotActive: number;
  private readonly maxPending: number;
  private readonly maxPendingPerBot: number;
  private readonly queueTimeoutMs: number;
  private pendingCount = 0;

  constructor(options: DesktopExecutionAdmissionOptions = {}) {
    this.maxConcurrent = boundedInteger(
      options.maxConcurrent ?? Math.min(availableParallelism(), 12),
      "maxConcurrent",
      256,
    );
    this.maxAutomaticAcp = boundedInteger(
      options.maxAutomaticAcp ??
        Math.max(1, Math.floor(this.maxConcurrent / 2)),
      "maxAutomaticAcp",
      this.maxConcurrent,
    );
    this.maxPerBotActive = boundedInteger(
      options.maxPerBotActive ?? Math.min(2, this.maxConcurrent),
      "maxPerBotActive",
      this.maxConcurrent,
    );
    this.maxPending = boundedInteger(
      options.maxPending ?? 512,
      "maxPending",
      4096,
    );
    this.maxPendingPerBot = boundedInteger(
      options.maxPendingPerBot ?? 16,
      "maxPendingPerBot",
      this.maxPending,
    );
    this.queueTimeoutMs = boundedInteger(
      options.queueTimeoutMs ?? 45_000,
      "queueTimeoutMs",
      120_000,
    );
  }

  private check(input: ClaimInput): ExecutionAdmissionResult | null {
    const leases = [...this.leases.values()];
    if (leases.some((lease) => lease.runId === input.runId))
      return { accepted: false, reason: "run_exists" };
    if (leases.length >= this.maxConcurrent)
      return { accepted: false, reason: "total_limit" };
    if (
      leases.filter((lease) => lease.botId === input.botId).length >=
      this.maxPerBotActive
    )
      return { accepted: false, reason: "bot_limit" };
    if (
      input.kind === "automatic-acp" &&
      leases.filter((lease) => lease.kind === "automatic-acp").length >=
        this.maxAutomaticAcp
    )
      return { accepted: false, reason: "automatic_acp_limit" };
    const mutationRoot = input.mutationRoot;
    if (
      mutationRoot &&
      leases.some(
        (lease) =>
          lease.mutationRoot && rootsOverlap(lease.mutationRoot, mutationRoot),
      )
    )
      return { accepted: false, reason: "mutation_conflict" };
    return null;
  }

  private grant(input: ClaimInput): ExecutionAdmissionResult {
    const lease: ExecutionAdmissionLease = {
      ...input,
      id: randomUUID(),
      admittedAt: new Date().toISOString(),
    };
    this.leases.set(lease.id, lease);
    return { accepted: true, leaseId: lease.id };
  }

  /** Legacy immediate admission. Host requests use acquire() to wait fairly. */
  claim(input: ClaimInput): ExecutionAdmissionResult {
    const normalized = {
      ...input,
      mutationRoot: validatedRoot(input.mutationRoot),
    };
    return this.check(normalized) ?? this.grant(normalized);
  }

  acquire(
    input: ClaimInput,
    options: { signal?: AbortSignal; deadline?: number } = {},
  ): Promise<ExecutionAdmissionResult> {
    if (options.signal?.aborted) return Promise.reject(this.abortError());
    const normalized = {
      ...input,
      mutationRoot: validatedRoot(input.mutationRoot),
    };
    if (
      [...this.leases.values()].some((lease) => lease.runId === input.runId) ||
      [...this.pending.values()].some((queue) =>
        queue.some((item) => item.input.runId === input.runId),
      )
    )
      return Promise.resolve({ accepted: false, reason: "run_exists" });
    const waitMs = Math.min(
      this.queueTimeoutMs,
      options.deadline === undefined
        ? this.queueTimeoutMs
        : Math.max(0, options.deadline - Date.now()),
    );
    if (waitMs <= 0)
      return Promise.resolve({ accepted: false, reason: "queue_timeout" });
    if (
      this.pendingCount >= this.maxPending ||
      (this.pending.get(input.botId)?.length ?? 0) >= this.maxPendingPerBot
    )
      return Promise.resolve({ accepted: false, reason: "queue_full" });
    return new Promise<ExecutionAdmissionResult>((resolve, reject) => {
      const onAbort = () => {
        if (!this.removePending(item)) return;
        reject(this.abortError());
        this.drain();
      };
      const item: PendingClaim = {
        input: normalized,
        resolve,
        signal: options.signal,
        onAbort,
        timer: setTimeout(() => {
          if (!this.removePending(item)) return;
          resolve({ accepted: false, reason: "queue_timeout" });
          this.drain();
        }, waitMs),
      };
      const queue = this.pending.get(input.botId);
      if (queue) queue.push(item);
      else {
        this.pending.set(input.botId, [item]);
        this.botOrder.push(input.botId);
      }
      this.pendingCount++;
      options.signal?.addEventListener("abort", onAbort, { once: true });
      if (options.signal?.aborted) onAbort();
      else this.drain();
    });
  }

  private abortError(): Error {
    return new DOMException("Execution admission was cancelled.", "AbortError");
  }
  private removePending(item: PendingClaim): boolean {
    const queue = this.pending.get(item.input.botId);
    const index = queue?.indexOf(item) ?? -1;
    if (!queue || index < 0) return false;
    queue.splice(index, 1);
    this.pendingCount--;
    clearTimeout(item.timer);
    item.signal?.removeEventListener("abort", item.onAbort);
    if (queue.length === 0) {
      this.pending.delete(item.input.botId);
      this.botOrder.splice(this.botOrder.indexOf(item.input.botId), 1);
    }
    return true;
  }
  private drain(): void {
    while (this.botOrder.length > 0) {
      let granted = false;
      for (const botId of [...this.botOrder]) {
        const item = this.pending.get(botId)?.[0];
        if (!item || this.check(item.input)) continue;
        this.removePending(item);
        const result = this.grant(item.input);
        const index = this.botOrder.indexOf(botId);
        if (index >= 0) this.botOrder.push(...this.botOrder.splice(index, 1));
        item.resolve(result);
        granted = true;
        break;
      }
      if (!granted) break;
    }
  }
  release(input: { botId: string; runId: string; leaseId: string }): boolean {
    const lease = this.leases.get(input.leaseId);
    if (!lease || lease.botId !== input.botId || lease.runId !== input.runId)
      return false;
    const released = this.leases.delete(input.leaseId);
    this.drain();
    return released;
  }
  releaseBot(botId: string): void {
    for (const item of [...(this.pending.get(botId) ?? [])]) {
      this.removePending(item);
      item.resolve({ accepted: false, reason: "bot_stopped" });
    }
    for (const lease of this.leases.values())
      if (lease.botId === botId) this.leases.delete(lease.id);
    this.drain();
  }
  list(): ExecutionAdmissionLease[] {
    return [...this.leases.values()].map((lease) => ({ ...lease }));
  }

  snapshot(): {
    capacity: {
      total: number;
      automaticAcp: number;
      perBot: number;
      pending: number;
      pendingPerBot: number;
    };
    active: number;
    pending: number;
    bots: Record<string, { active: number; pending: number }>;
  } {
    const bots: Record<string, { active: number; pending: number }> =
      Object.create(null);
    for (const lease of this.leases.values()) {
      const count = bots[lease.botId] ?? { active: 0, pending: 0 };
      count.active++;
      bots[lease.botId] = count;
    }
    for (const [botId, queue] of this.pending) {
      const count = bots[botId] ?? { active: 0, pending: 0 };
      count.pending = queue.length;
      bots[botId] = count;
    }
    return {
      capacity: {
        total: this.maxConcurrent,
        automaticAcp: this.maxAutomaticAcp,
        perBot: this.maxPerBotActive,
        pending: this.maxPending,
        pendingPerBot: this.maxPendingPerBot,
      },
      active: this.leases.size,
      pending: this.pendingCount,
      bots,
    };
  }

  handle(
    botId: string,
    operation: "execution.claim",
    payload: unknown,
    authority?: { mutationRoot?: string },
    signal?: AbortSignal,
  ): Promise<ExecutionAdmissionResult>;
  handle(
    botId: string,
    operation: "execution.release",
    payload: unknown,
    authority?: { mutationRoot?: string },
    signal?: AbortSignal,
  ): { released: boolean };
  handle(
    botId: string,
    operation: "execution.claim" | "execution.release",
    payload: unknown,
    authority?: { mutationRoot?: string },
    signal?: AbortSignal,
  ): Promise<ExecutionAdmissionResult> | { released: boolean };
  handle(
    botId: string,
    operation: "execution.claim" | "execution.release",
    payload: unknown,
    authority: { mutationRoot?: string } = {},
    signal?: AbortSignal,
  ): Promise<ExecutionAdmissionResult> | { released: boolean } {
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw new Error("Execution admission request is invalid.");
    const input = payload as Record<string, unknown>;
    if (operation === "execution.claim") {
      if (
        typeof input.runId !== "string" ||
        !/^[A-Za-z0-9:_-]{1,128}$/u.test(input.runId) ||
        typeof input.sessionId !== "string" ||
        input.sessionId.length < 1 ||
        input.sessionId.length > 512 ||
        /[\p{Cc}\p{Cf}]/u.test(input.sessionId) ||
        (input.kind !== "foreground" && input.kind !== "automatic-acp")
      )
        throw new Error("Execution admission request is invalid.");
      return this.acquire(
        {
          botId,
          runId: input.runId,
          sessionId: input.sessionId,
          kind: input.kind,
          mutationRoot: authority.mutationRoot,
        },
        { signal },
      );
    }
    if (
      typeof input.runId !== "string" ||
      typeof input.leaseId !== "string" ||
      !/^[0-9a-f-]{36}$/iu.test(input.leaseId)
    )
      throw new Error("Execution release request is invalid.");
    return {
      released: this.release({
        botId,
        runId: input.runId,
        leaseId: input.leaseId,
      }),
    };
  }
}
