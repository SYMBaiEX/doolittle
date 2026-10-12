import { describe, expect, it } from "vitest";
import {
  matchingTerminalClaimReceipt,
  mergeTerminalRunReceipt,
  type RunClaim,
} from "./run-claim-reconciliation";

const claim: RunClaim = {
  runId: "run-a",
  sessionId: "session-a",
  botId: "bot-a",
  generation: 4,
};
const terminalRun = {
  runId: claim.runId,
  sessionId: claim.sessionId,
  botId: claim.botId,
  status: "cancelled",
  localMutations: [],
};
const current = {
  sessions: { [claim.runId]: claim.sessionId },
  bots: { [claim.runId]: claim.botId },
  generations: { [claim.runId]: claim.generation },
  claimedSessions: { [claim.sessionId]: true as const },
};

describe("terminal run claim reconciliation", () => {
  it("accepts only a terminal receipt for the exact current claim", () => {
    expect(
      matchingTerminalClaimReceipt(terminalRun, claim, current)?.latest.type,
    ).toBe("cancelled");
    expect(
      matchingTerminalClaimReceipt(
        { ...terminalRun, status: "thinking" },
        claim,
        current,
      ),
    ).toBeNull();
  });

  it("keeps the claim when the receipt bot, session, or run differs", () => {
    for (const mismatch of [
      { runId: "run-stale" },
      { sessionId: "session-stale" },
      { botId: "bot-stale" },
    ]) {
      expect(
        matchingTerminalClaimReceipt(
          { ...terminalRun, ...mismatch },
          claim,
          current,
        ),
      ).toBeNull();
    }
  });

  it("keeps a replaced or ambiguous claim even with a matching old receipt", () => {
    expect(
      matchingTerminalClaimReceipt(terminalRun, claim, {
        ...current,
        generations: { [claim.runId]: claim.generation + 1 },
      }),
    ).toBeNull();
    expect(
      matchingTerminalClaimReceipt(terminalRun, claim, {
        ...current,
        sessions: { ...current.sessions, "run-new": claim.sessionId },
      }),
    ).toBeNull();
  });

  it("does not accumulate duplicate terminal events across repeated hydration", () => {
    const terminal = matchingTerminalClaimReceipt(terminalRun, claim, current);
    expect(terminal).not.toBeNull();
    if (!terminal) throw new Error("Expected terminal receipt");
    const started = {
      type: "started" as const,
      sessionId: claim.sessionId,
      run: { ...terminalRun, status: "thinking" },
    };
    let receipt = {
      latest: started,
      events: [started],
    } as typeof terminal;
    for (let index = 0; index < 40; index += 1) {
      receipt = mergeTerminalRunReceipt(receipt, terminal);
    }
    expect(receipt.latest.type).toBe("cancelled");
    expect(receipt.events.map((event) => event.type)).toEqual([
      "started",
      "cancelled",
    ]);
  });
});
