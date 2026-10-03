import {
  CODING_VERIFICATION_COMMAND,
  CODING_VERIFICATION_ID,
  CODING_VERIFICATION_SUCCESS_MARKER,
} from "@doolittle/contracts";
import { describe, expect, it } from "vitest";
import { CodingVerificationReceiptTracker } from "./coding-verification-receipts";

const identity = {
  sessionId: "cli:session",
  runId: "run-1",
  roomId: "room-1",
  source: "cli",
};

function successfulActionResult(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      actionName: "SHELL",
      command: CODING_VERIFICATION_COMMAND,
      runId: "terminal-run-1",
      exitCode: 0,
      timedOut: false,
      truncated: false,
      executedIn: "/task/workspace",
      stdout: CODING_VERIFICATION_SUCCESS_MARKER,
      stderr: "",
      ...overrides,
    },
  };
}

function terminalObservation(overrides: Record<string, unknown> = {}) {
  return {
    record: {
      id: "terminal-run-1",
      command: CODING_VERIFICATION_COMMAND,
      backend: "local",
      backendMode: "local",
      cwd: "/task/workspace",
      exitCode: 0,
      stdout: CODING_VERIFICATION_SUCCESS_MARKER,
      stderr: "",
      timedOut: false,
      startedAt: "2026-10-03T00:00:00.000Z",
      completedAt: "2026-10-03T00:00:01.000Z",
      ...overrides,
    },
    sandbox: "host",
  };
}

function successfulReceipt(tracker = new CodingVerificationReceiptTracker()) {
  tracker.actionStarted(identity, "SHELL");
  tracker.observeTerminalExecution(terminalObservation());
  return tracker.actionCompleted({
    identity,
    action: "SHELL",
    status: "completed",
    actionResult: successfulActionResult(),
    expectedWorkdir: "/task/workspace",
  });
}

describe("coding verification runtime receipt tracker", () => {
  it("projects one original, paired local verifier result into a closed receipt", () => {
    const event = successfulReceipt();
    expect(event).toMatchObject({
      sessionId: identity.sessionId,
      runId: identity.runId,
      roomId: identity.roomId,
      receipt: {
        type: "coding-verification",
        verifier: CODING_VERIFICATION_ID,
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
      },
    });
    const serialized = JSON.stringify(event?.receipt);
    expect(serialized).not.toContain(CODING_VERIFICATION_COMMAND);
    expect(serialized).not.toContain(CODING_VERIFICATION_SUCCESS_MARKER);
    expect(serialized).not.toContain("terminal-run-1");
    expect(Object.keys(event?.receipt ?? {}).sort()).toEqual([
      "actionPairMatched",
      "exitCode",
      "reason",
      "shellCompletions",
      "shellStarts",
      "status",
      "success",
      "timedOut",
      "timestamp",
      "truncated",
      "type",
      "verifier",
      "verifierMatches",
      "workdirMatches",
    ]);
  });

  it("does not treat RUN_COMMAND similes as native SHELL action identity", () => {
    const tracker = new CodingVerificationReceiptTracker();
    tracker.actionStarted(identity, "RUN_COMMAND");
    expect(
      tracker.actionCompleted({
        identity,
        action: "RUN_COMMAND",
        status: "completed",
        actionResult: successfulActionResult(),
        expectedWorkdir: "/task/workspace",
      }),
    ).toBeUndefined();
  });

  it("fails closed when the original start is absent or overlapping", () => {
    const absent = new CodingVerificationReceiptTracker();
    const missingStart = absent.actionCompleted({
      identity,
      action: "SHELL",
      status: "completed",
      actionResult: successfulActionResult(),
      expectedWorkdir: "/task/workspace",
    });
    expect(missingStart?.receipt).toMatchObject({
      status: "unavailable",
      reason: "identity-unavailable",
      shellStarts: 0,
      shellCompletions: 1,
      actionPairMatched: false,
    });

    const overlapping = new CodingVerificationReceiptTracker();
    overlapping.actionStarted(identity, "SHELL");
    overlapping.actionStarted(identity, "SHELL");
    overlapping.observeTerminalExecution(terminalObservation());
    const ambiguous = overlapping.actionCompleted({
      identity,
      action: "SHELL",
      status: "completed",
      actionResult: successfulActionResult(),
      expectedWorkdir: "/task/workspace",
    });
    expect(ambiguous?.receipt).toMatchObject({
      status: "unavailable",
      reason: "verifier-ambiguous",
      shellStarts: 2,
      shellCompletions: 1,
      actionPairMatched: false,
    });
  });

  it.each([
    ["nonzero exit", { exitCode: 1 }, { exitCode: 1 }, "verifier-failed"],
    ["timeout", { timedOut: true }, { timedOut: true }, "verifier-failed"],
    ["truncation", { truncated: true }, {}, "verifier-failed"],
    ["foreign workdir", {}, { cwd: "/elsewhere" }, "verifier-failed"],
    ["wrong original stdout", {}, { stdout: "wrong" }, "marker-mismatch"],
    ["wrong action stdout", { stdout: "wrong" }, {}, "marker-mismatch"],
  ] as const)(
    "rejects $0",
    (_label, actionOverrides, terminalOverrides, reason) => {
      const tracker = new CodingVerificationReceiptTracker();
      tracker.actionStarted(identity, "SHELL");
      tracker.observeTerminalExecution(terminalObservation(terminalOverrides));
      const event = tracker.actionCompleted({
        identity,
        action: "SHELL",
        status: "completed",
        actionResult: successfulActionResult(actionOverrides),
        expectedWorkdir: "/task/workspace",
      });
      expect(event?.receipt).toMatchObject({ status: "failed", reason });
    },
  );

  it.each([
    ["no invocation-local observation", undefined, "identity-unavailable"],
    ["sandboxed execution", "docker", "identity-unavailable"],
  ])("does not attest %s", (_label, sandbox, reason) => {
    const tracker = new CodingVerificationReceiptTracker();
    tracker.actionStarted(identity, "SHELL");
    if (sandbox) {
      tracker.observeTerminalExecution({
        ...terminalObservation(),
        sandbox,
      });
    }
    const event = tracker.actionCompleted({
      identity,
      action: "SHELL",
      status: "completed",
      actionResult: successfulActionResult(),
      expectedWorkdir: "/task/workspace",
    });
    expect(event?.receipt).toMatchObject({
      status: "unavailable",
      reason,
    });
  });

  it("requires an explicit action truncation boolean", () => {
    const tracker = new CodingVerificationReceiptTracker();
    tracker.actionStarted(identity, "SHELL");
    tracker.observeTerminalExecution(terminalObservation());
    const event = tracker.actionCompleted({
      identity,
      action: "SHELL",
      status: "completed",
      actionResult: successfulActionResult({ truncated: undefined }),
      expectedWorkdir: "/task/workspace",
    });
    expect(event?.receipt).toMatchObject({
      status: "unavailable",
      reason: "identity-unavailable",
    });
  });

  it("requires the explicit current CLI identity", () => {
    const tracker = new CodingVerificationReceiptTracker();
    tracker.actionStarted({ ...identity, source: "worker" }, "SHELL");
    expect(
      tracker.actionCompleted({
        identity: { ...identity, source: "worker" },
        action: "SHELL",
        status: "completed",
        actionResult: successfulActionResult(),
        expectedWorkdir: "/task/workspace",
      }),
    ).toBeUndefined();
  });

  it("rejects repeated exact verifier actions", () => {
    const tracker = new CodingVerificationReceiptTracker();
    successfulReceipt(tracker);
    tracker.actionStarted(identity, "SHELL");
    tracker.observeTerminalExecution(terminalObservation());
    const duplicate = tracker.actionCompleted({
      identity,
      action: "SHELL",
      status: "completed",
      actionResult: successfulActionResult(),
      expectedWorkdir: "/task/workspace",
    });
    expect(duplicate?.receipt).toMatchObject({
      status: "unavailable",
      reason: "verifier-ambiguous",
      shellStarts: 2,
      shellCompletions: 2,
      verifierMatches: 2,
    });
  });

  it("requires the SDK completion status and action success", () => {
    const tracker = new CodingVerificationReceiptTracker();
    tracker.actionStarted(identity, "SHELL");
    tracker.observeTerminalExecution(terminalObservation());
    const event = tracker.actionCompleted({
      identity,
      action: "SHELL",
      status: "failed",
      actionResult: successfulActionResult(),
      expectedWorkdir: "/task/workspace",
    });
    expect(event?.receipt).toMatchObject({
      status: "failed",
      reason: "verifier-failed",
      success: false,
    });
  });
});
