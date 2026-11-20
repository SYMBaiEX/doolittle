import { expect, it } from "vitest";
import { chatFailureDisposition } from "../../apps/desktop/src/renderer/chat/chat-terminal-events";
import type { RunReceipt } from "../../apps/desktop/src/renderer/chat/models";
import {
  isTerminalClaimReceipt,
  RunClaims,
} from "../../apps/desktop/src/renderer/chat/run-claim-reconciliation";
import { bufferStreamedResponse } from "../../apps/desktop/src/renderer/chat/streamed-response";

import type { ChatEvent } from "../../apps/desktop/src/shared/contracts";

const runId = "run-a";
const sessionId = "conversation-a";
const botId = "bot-a";
const receipt: RunReceipt = {
  latest: {
    type: "cancelled",
    sessionId,
    run: {
      runId,
      sessionId,
      botId,
      status: "cancelled",
      roomId: sessionId,
      source: "desktop",
      message: "",
      runDepth: "standard",
      configuredMaxIterations: 4,
      observedActionCount: 1,
      progressMode: "all",
      localMutations: [],
      pendingApprovals: 0,
      startedAt: "2026-11-20T00:00:00Z",
      updatedAt: "2026-11-20T00:01:00Z",
    },
  },
  events: [],
};

it("retains a run claim across a duplicate inventory refresh while Stop verifies the receipt", () => {
  const claims = new RunClaims();
  const claim = claims.reserve(runId, sessionId, botId);
  if (!claim) throw new Error("The first request must reserve the session.");

  expect(claims.reserve("second-run", sessionId, botId)).toBeUndefined();
  expect(isTerminalClaimReceipt(receipt, claim, claims)).toBe(false);
  expect(claims.activate(claim)).toBe(true);
  expect(claims.recover(runId, sessionId, botId)).toBe(true);
  expect(claims.recover(runId, sessionId, "other-bot")).toBe(false);
  expect(claims.get(runId)).toBe(claim);
  expect(isTerminalClaimReceipt(receipt, claim, claims)).toBe(true);
  expect(claims.release(claim)).toBe(true);
  expect(claims.recover(runId, sessionId, botId)).toBe(true);
  expect(isTerminalClaimReceipt(receipt, claim, claims)).toBe(false);
  expect(claims.release(claim)).toBe(false);
});

it("keeps a recovered run in control when it appears during pending scope confirmation", () => {
  const claims = new RunClaims();
  const pending = claims.reserve(runId, sessionId, botId);
  if (!pending) throw new Error("The request must reserve the session.");

  expect(claims.recover("recovered", sessionId, botId)).toBe(true);
  expect(claims.activate(pending)).toBe(false);
  expect(claims.release(pending)).toBe(true);
  expect([...claims.activeIds(sessionId)]).toEqual(["recovered"]);
  expect(claims.reserve("another-run", sessionId, botId)).toBeUndefined();
});

it("keeps deltas that follow a full response within the same render frame", () => {
  const first = bufferStreamedResponse(undefined, { delta: "the old partial" });
  const replacement = bufferStreamedResponse(first, { response: "result" });
  const last = bufferStreamedResponse(replacement, { delta: " completed" });

  expect(last).toEqual({ replace: true, text: "result completed" });
});

it("distinguishes an accepted stream disconnect from the owned terminal events", () => {
  const disconnected: ChatEvent = {
    requestId: runId,
    event: "error",
    transportError: true,
    data: {},
  };
  expect(chatFailureDisposition(disconnected)).toBe("disconnected");
  expect(chatFailureDisposition({ ...disconnected, eventId: 7 })).toBe(
    "terminal",
  );
  expect(
    chatFailureDisposition({ ...disconnected, transportError: undefined }),
  ).toBe("submission");
  expect(
    chatFailureDisposition({ ...disconnected, event: "response.failed" }),
  ).toBe("terminal");
});

it("ignores stale inventory after reconciling the detached run's terminal receipt", () => {
  const claims = new RunClaims();
  expect(claims.recover(runId, sessionId, botId)).toBe(true);
  const claim = claims.get(runId);
  if (!claim) throw new Error("The accepted run must own the session.");

  expect(claims.reserve("duplicate-send", sessionId, botId)).toBeUndefined();
  expect(isTerminalClaimReceipt(receipt, claim, claims)).toBe(true);
  expect(claims.settle(claim)).toBe(true);
  expect(claims.recover(runId, sessionId, botId)).toBe(false);
  expect(claims.reserve("new-send", sessionId, botId)).toBeDefined();
});
