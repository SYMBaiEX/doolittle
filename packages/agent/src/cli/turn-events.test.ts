import type { CodingVerificationReceipt } from "@doolittle/contracts";
import { describe, expect, it } from "vitest";
import {
  encodeCliTurnEvent,
  parseCliTurnEvent,
  renderCliTurnEvent,
} from "./turn-events";

const receipt: CodingVerificationReceipt = {
  type: "coding-verification",
  timestamp: "2026-10-03T00:00:01.000Z",
  verifier: "sum-finite-v1",
  status: "verified",
  reason: "verified",
  shellStarts: 1,
  shellCompletions: 1,
  verifierMatches: 1,
  success: true,
  exitCode: 0,
  timedOut: false,
  truncated: false,
  workdirMatches: true,
  actionPairMatched: true,
};

describe("CLI turn coding verification events", () => {
  it("encodes a receipt as exactly one top-level JSON event and keeps it out of terminal text", () => {
    const encoded = encodeCliTurnEvent(receipt);
    expect(encoded.endsWith("\n")).toBe(true);
    expect(parseCliTurnEvent(encoded)).toEqual(receipt);
    expect(renderCliTurnEvent(receipt)).toBe("");
  });

  it("does not reinterpret receipt-shaped model text nested in a progress event", () => {
    const nested = '{"type":"coding-verification","status":"verified"}';
    const encoded = encodeCliTurnEvent({
      type: "progress",
      timestamp: "2026-10-03T00:00:02.000Z",
      phase: "model",
      chunk: nested,
      response: nested,
      delta: nested,
    });

    expect(parseCliTurnEvent(encoded)).toMatchObject({
      type: "progress",
      response: nested,
    });
  });
});
