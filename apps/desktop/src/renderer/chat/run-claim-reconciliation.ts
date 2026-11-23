import { isTerminalRunStatus } from "@doolittle/contracts/run";
import { type RunReceipt, retainRunEvents, runEventKey } from "./models";

export interface RunClaim {
  readonly runId: string;
  readonly sessionId: string;
  readonly botId: string;
  active: boolean;
}

/** Synchronous admission shared by all desktop conversation panels. */
export class RunClaims {
  private claims = new Map<string, RunClaim>();
  private settled = new Set<string>();

  get(runId: string): RunClaim | undefined {
    return this.claims.get(runId);
  }

  isSettled(runId: string): boolean {
    return this.settled.has(runId);
  }

  forSession(sessionId: string, except?: RunClaim): RunClaim | undefined {
    for (const claim of this.claims.values()) {
      if (claim.sessionId === sessionId && claim !== except) return claim;
    }
  }

  activeIds(sessionId: string): Set<string> {
    const ids = new Set<string>();
    for (const claim of this.claims.values()) {
      if (claim.active && claim.sessionId === sessionId) ids.add(claim.runId);
    }
    return ids;
  }

  reserve(
    runId: string,
    sessionId: string,
    botId: string,
  ): RunClaim | undefined {
    if (
      this.settled.has(runId) ||
      this.claims.has(runId) ||
      this.forSession(sessionId)
    )
      return;
    const claim = { runId, sessionId, botId, active: false };
    this.claims.set(runId, claim);
    return claim;
  }

  activate(claim: RunClaim): boolean {
    if (
      this.get(claim.runId) !== claim ||
      this.forSession(claim.sessionId, claim)
    )
      return false;
    claim.active = true;
    return true;
  }

  recover(runId: string, sessionId: string, botId: string): boolean {
    if (this.settled.has(runId)) return false;
    const existing = this.get(runId);
    if (existing) {
      // Repeating inventory cannot invalidate a pending Stop receipt for this run.
      return (
        existing.active &&
        existing.sessionId === sessionId &&
        existing.botId === botId
      );
    }
    this.claims.set(runId, { runId, sessionId, botId, active: true });
    return true;
  }

  release(claim: RunClaim): boolean {
    if (this.get(claim.runId) !== claim) return false;
    return this.claims.delete(claim.runId);
  }

  settle(claim: RunClaim): boolean {
    if (!this.release(claim)) return false;
    // A run inventory request can finish after a newer targeted Stop receipt.
    this.settled.add(claim.runId);
    if (this.settled.size > 500) {
      const oldest = this.settled.values().next().value;
      if (oldest !== undefined) this.settled.delete(oldest);
    }
    return true;
  }
}

export function mergeTerminalRunReceipt(
  prior: RunReceipt | undefined,
  terminal: RunReceipt,
): RunReceipt {
  if (!prior) return terminal;
  const events = new Map(
    terminal.events.map((event) => [runEventKey(event), event]),
  );
  for (const event of prior.events) {
    const key = runEventKey(event);
    if (!events.has(key)) events.set(key, event);
  }
  const chronological = [...events.values()].sort(
    (left, right) =>
      Date.parse(left.run.updatedAt) - Date.parse(right.run.updatedAt),
  );
  return { latest: terminal.latest, events: retainRunEvents(chronological) };
}

/** A terminal receipt can release only the exact claim that requested it. */
export function isTerminalClaimReceipt(
  receipt: RunReceipt,
  claim: RunClaim,
  claims: RunClaims,
): boolean {
  const { run } = receipt.latest;
  return (
    isTerminalRunStatus(run.status) &&
    run.runId === claim.runId &&
    run.sessionId === claim.sessionId &&
    run.botId === claim.botId &&
    claims.get(claim.runId) === claim &&
    claim.active &&
    !claims.forSession(claim.sessionId, claim)
  );
}
