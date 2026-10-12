import { historicalRunReceipt, type RunReceipt, runEventKey } from "./models";

export interface RunClaim {
  runId: string;
  sessionId: string;
  botId: string;
  generation: number;
}

export function mergeTerminalRunReceipt(
  prior: RunReceipt | undefined,
  terminal: RunReceipt,
): RunReceipt {
  if (!prior) return terminal;
  const events = new Map(
    [...prior.events, ...terminal.events].map((event) => [
      runEventKey(event),
      event,
    ]),
  );
  return { latest: terminal.latest, events: [...events.values()].slice(-30) };
}

/** A terminal receipt can release only the exact claim that requested it. */
export function matchingTerminalClaimReceipt(
  run: unknown,
  claim: RunClaim,
  current: {
    sessions: Readonly<Record<string, string>>;
    bots: Readonly<Record<string, string>>;
    generations: Readonly<Record<string, number>>;
    claimedSessions: Readonly<Record<string, true>>;
  },
  persistedUpdates?: unknown,
): RunReceipt | null {
  if (!run || typeof run !== "object" || Array.isArray(run)) return null;
  const candidate = run as Record<string, unknown>;
  if (
    candidate.runId !== claim.runId ||
    candidate.sessionId !== claim.sessionId ||
    candidate.botId !== claim.botId ||
    current.sessions[claim.runId] !== claim.sessionId ||
    current.bots[claim.runId] !== claim.botId ||
    current.generations[claim.runId] !== claim.generation ||
    !current.claimedSessions[claim.sessionId] ||
    Object.entries(current.sessions).some(
      ([runId, sessionId]) =>
        runId !== claim.runId && sessionId === claim.sessionId,
    )
  )
    return null;
  return historicalRunReceipt(candidate, persistedUpdates);
}
