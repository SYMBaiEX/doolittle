import {
  CODING_VERIFICATION_COMMAND,
  CODING_VERIFICATION_ID,
  CODING_VERIFICATION_SUCCESS_MARKER,
  type CodingVerificationReceipt,
} from "@doolittle/contracts";

export interface CodingVerificationRunIdentity {
  sessionId: string;
  runId: string;
  roomId: string;
  source: string;
}

export interface ScopedCodingVerificationReceipt {
  sessionId: string;
  runId: string;
  roomId: string;
  receipt: CodingVerificationReceipt;
}

export interface ObservedTerminalExecution {
  record: {
    id: string;
    command: string;
    backend: string;
    backendMode?: string;
    cwd: string;
    exitCode: number;
    stdout: string;
    stderr: string;
    timedOut?: boolean;
    startedAt: string;
    completedAt: string;
  };
  sandbox?: string;
}

interface RunState {
  identity: CodingVerificationRunIdentity;
  shellStarts: number;
  shellCompletions: number;
  verifierMatches: number;
  pendingStart: boolean;
  ambiguous: boolean;
  foreignContext: boolean;
  terminalObservation?: ObservedTerminalExecution;
  terminalObservationCount: number;
}

function hasIdentity(
  identity: CodingVerificationRunIdentity | undefined,
): identity is CodingVerificationRunIdentity {
  return (
    identity?.source === "cli" &&
    typeof identity.sessionId === "string" &&
    identity.sessionId.trim().length > 0 &&
    typeof identity.runId === "string" &&
    identity.runId.trim().length > 0 &&
    typeof identity.roomId === "string" &&
    identity.roomId.trim().length > 0
  );
}

function sameIdentity(
  left: CodingVerificationRunIdentity,
  right: CodingVerificationRunIdentity,
): boolean {
  return (
    left.sessionId === right.sessionId &&
    left.runId === right.runId &&
    left.roomId === right.roomId &&
    left.source === right.source
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 255
    ? value
    : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function timestamp(): string {
  return new Date().toISOString();
}

export class CodingVerificationReceiptTracker {
  private readonly runs = new Map<string, RunState>();

  actionStarted(
    identity: CodingVerificationRunIdentity | undefined,
    action: string | undefined,
  ): void {
    if (!hasIdentity(identity) || action !== "SHELL") return;
    let state = this.runs.get(identity.runId);
    if (!state) {
      state = {
        identity: { ...identity },
        shellStarts: 0,
        shellCompletions: 0,
        verifierMatches: 0,
        pendingStart: false,
        ambiguous: false,
        foreignContext: false,
        terminalObservationCount: 0,
      };
      this.runs.set(identity.runId, state);
    }
    if (!sameIdentity(state.identity, identity)) {
      state.foreignContext = true;
      return;
    }
    state.shellStarts++;
    if (state.pendingStart) state.ambiguous = true;
    state.pendingStart = true;
  }

  observeTerminalExecution(observation: ObservedTerminalExecution): void {
    if (observation.record.command !== CODING_VERIFICATION_COMMAND) return;
    const pending = Array.from(this.runs.values()).filter(
      (state) => state.pendingStart,
    );
    if (pending.length !== 1) {
      for (const state of pending) state.ambiguous = true;
      return;
    }
    const state = pending[0];
    if (!state) return;
    state.terminalObservationCount++;
    if (state.terminalObservationCount > 1) {
      state.ambiguous = true;
      state.terminalObservation = undefined;
      return;
    }
    state.terminalObservation = observation;
  }

  actionCompleted(input: {
    identity: CodingVerificationRunIdentity | undefined;
    action: string | undefined;
    status: string | undefined;
    actionResult: unknown;
    expectedWorkdir: string | undefined;
  }): ScopedCodingVerificationReceipt | undefined {
    const { identity } = input;
    if (!hasIdentity(identity) || input.action !== "SHELL") return undefined;

    let state = this.runs.get(identity.runId);
    if (!state) {
      state = {
        identity: { ...identity },
        shellStarts: 0,
        shellCompletions: 0,
        verifierMatches: 0,
        pendingStart: false,
        ambiguous: false,
        foreignContext: false,
        terminalObservationCount: 0,
      };
      this.runs.set(identity.runId, state);
    }
    if (!sameIdentity(state.identity, identity)) state.foreignContext = true;

    state.shellCompletions++;
    const actionPairMatched = state.pendingStart && !state.ambiguous;
    state.pendingStart = false;
    const terminalObservation = state.terminalObservation;
    state.terminalObservation = undefined;

    const actionResult = record(input.actionResult) ? input.actionResult : {};
    const data = record(actionResult.data) ? actionResult.data : {};
    if (
      data.actionName !== "SHELL" ||
      data.command !== CODING_VERIFICATION_COMMAND
    )
      return undefined;

    state.verifierMatches++;
    const success =
      actionResult.success === true && input.status === "completed";
    const exitCode = finiteNumber(data.exitCode);
    const timedOut = booleanOrNull(data.timedOut);
    const truncated = booleanOrNull(data.truncated);
    const observedRecord = terminalObservation?.record;
    const observedRunMatches = Boolean(
      terminalObservation?.sandbox === "host" &&
        observedRecord &&
        observedRecord.id === data.runId &&
        observedRecord.command === data.command &&
        observedRecord.exitCode === data.exitCode &&
        observedRecord.stdout === data.stdout &&
        observedRecord.stderr === data.stderr &&
        observedRecord.backend === "local" &&
        observedRecord.backendMode === "local" &&
        typeof observedRecord.startedAt === "string" &&
        Number.isFinite(Date.parse(observedRecord.startedAt)) &&
        typeof observedRecord.completedAt === "string" &&
        Number.isFinite(Date.parse(observedRecord.completedAt)),
    );
    const outputCaptureMatches =
      data.truncated === false &&
      data.stdout === CODING_VERIFICATION_SUCCESS_MARKER &&
      data.stderr === "";
    const workdirMatches =
      typeof input.expectedWorkdir === "string" &&
      input.expectedWorkdir.length > 0 &&
      observedRunMatches &&
      observedRecord?.cwd === input.expectedWorkdir;

    const balancedShellEvents =
      state.shellStarts > 0 && state.shellStarts === state.shellCompletions;
    let status: CodingVerificationReceipt["status"] = "failed";
    let reason: CodingVerificationReceipt["reason"] = "verifier-failed";
    if (state.foreignContext) {
      status = "unavailable";
      reason = "foreign-context";
    } else if (state.ambiguous || state.verifierMatches > 1) {
      status = "unavailable";
      reason = "verifier-ambiguous";
    } else if (!actionPairMatched || !balancedShellEvents) {
      status = "unavailable";
      reason = "identity-unavailable";
    } else if (
      success &&
      exitCode === 0 &&
      timedOut === false &&
      truncated === false &&
      observedRecord?.timedOut === false &&
      outputCaptureMatches &&
      workdirMatches &&
      observedRunMatches
    ) {
      status = "verified";
      reason = "verified";
    } else if (
      data.stdout !== CODING_VERIFICATION_SUCCESS_MARKER ||
      data.stderr !== "" ||
      (observedRecord !== undefined &&
        (observedRecord.stdout !== CODING_VERIFICATION_SUCCESS_MARKER ||
          observedRecord.stderr !== ""))
    ) {
      reason = "marker-mismatch";
    } else if (
      !terminalObservation ||
      !observedRunMatches ||
      timedOut === null ||
      truncated === null
    ) {
      status = "unavailable";
      reason = "identity-unavailable";
    }

    const receipt: CodingVerificationReceipt = {
      type: "coding-verification",
      timestamp: timestamp(),
      verifier: CODING_VERIFICATION_ID,
      status,
      reason,
      shellStarts: state.shellStarts,
      shellCompletions: state.shellCompletions,
      verifierMatches: state.verifierMatches,
      success,
      exitCode,
      timedOut,
      truncated,
      workdirMatches,
      actionPairMatched,
    };
    return {
      sessionId: identity.sessionId,
      runId: identity.runId,
      roomId: identity.roomId,
      receipt,
    };
  }

  clearRun(runId: string): void {
    this.runs.delete(runId);
  }
}
