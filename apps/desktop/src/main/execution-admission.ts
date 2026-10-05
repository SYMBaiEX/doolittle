import { randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
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
        | "mutation_conflict"
        | "run_exists";
    };

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

/** Process-wide admission; a detached UI subscriber never frees an execution. */
export class DesktopExecutionAdmission {
  private readonly leases = new Map<string, ExecutionAdmissionLease>();

  claim(input: {
    botId: string;
    runId: string;
    sessionId: string;
    kind: ExecutionAdmissionKind;
    mutationRoot?: string;
  }): ExecutionAdmissionResult {
    if (
      [...this.leases.values()].some((lease) => lease.runId === input.runId)
    ) {
      return { accepted: false, reason: "run_exists" };
    }
    if (this.leases.size >= 4) {
      return { accepted: false, reason: "total_limit" };
    }
    if (
      input.kind === "automatic-acp" &&
      [...this.leases.values()].filter(
        (lease) => lease.kind === "automatic-acp",
      ).length >= 2
    ) {
      return { accepted: false, reason: "automatic_acp_limit" };
    }
    const mutationRoot = input.mutationRoot
      ? existsSync(input.mutationRoot)
        ? realpathSync(input.mutationRoot)
        : resolve(input.mutationRoot)
      : undefined;
    if (
      mutationRoot &&
      [...this.leases.values()].some(
        (lease) =>
          lease.mutationRoot && rootsOverlap(lease.mutationRoot, mutationRoot),
      )
    ) {
      return { accepted: false, reason: "mutation_conflict" };
    }
    const lease: ExecutionAdmissionLease = {
      ...input,
      ...(mutationRoot ? { mutationRoot } : {}),
      id: randomUUID(),
      admittedAt: new Date().toISOString(),
    };
    this.leases.set(lease.id, lease);
    return { accepted: true, leaseId: lease.id };
  }

  release(input: { botId: string; runId: string; leaseId: string }): boolean {
    const lease = this.leases.get(input.leaseId);
    if (!lease || lease.botId !== input.botId || lease.runId !== input.runId) {
      return false;
    }
    return this.leases.delete(input.leaseId);
  }

  releaseBot(botId: string): void {
    for (const lease of this.leases.values()) {
      if (lease.botId === botId) this.leases.delete(lease.id);
    }
  }

  list(): ExecutionAdmissionLease[] {
    return [...this.leases.values()].map((lease) => ({ ...lease }));
  }

  handle(
    botId: string,
    operation: "execution.claim" | "execution.release",
    payload: unknown,
    authority: { mutationRoot?: string } = {},
  ): unknown {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Execution admission request is invalid.");
    }
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
      ) {
        throw new Error("Execution admission request is invalid.");
      }
      return this.claim({
        botId,
        runId: input.runId,
        sessionId: input.sessionId,
        kind: input.kind,
        mutationRoot: authority.mutationRoot,
      });
    }
    if (
      typeof input.runId !== "string" ||
      typeof input.leaseId !== "string" ||
      !/^[0-9a-f-]{36}$/iu.test(input.leaseId)
    ) {
      throw new Error("Execution release request is invalid.");
    }
    return {
      released: this.release({
        botId,
        runId: input.runId,
        leaseId: input.leaseId,
      }),
    };
  }
}
