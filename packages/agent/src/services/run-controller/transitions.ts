import type { RunSnapshot, RunUpdateType, StartTurnInput } from "./types";
import { nowIso } from "./utils";

export interface StartRunTransition {
  run: RunSnapshot;
  type: RunUpdateType;
}

export const createRunStartTransition = (
  input: StartTurnInput,
): StartRunTransition => {
  const now = nowIso();
  return {
    type: "started",
    run: {
      runId: input.runId,
      sessionId: input.sessionId,
      roomId: input.roomId,
      source: input.source,
      message: input.message,
      runDepth: input.runDepth,
      configuredMaxIterations: input.configuredMaxIterations,
      observedActionCount: 0,
      progressMode: input.progressMode,
      status: "thinking",
      pendingApprovals: input.pendingApprovals ?? 0,
      startedAt: now,
      updatedAt: now,
    },
  };
};

export const createPatchedTransition = (
  current: RunSnapshot,
  patch: Partial<RunSnapshot>,
  type: RunUpdateType,
): StartRunTransition => ({
  type,
  run: {
    ...current,
    ...patch,
    updatedAt: nowIso(),
  },
});

export const actionStartedTransition = (
  current: RunSnapshot,
  action: string,
): StartRunTransition => {
  const nextObservedActionCount = current.observedActionCount + 1;
  return createPatchedTransition(
    current,
    {
      status: "acting",
      activeAction: action,
      activeStream: "action",
      statusDetail: undefined,
      lastAction: action,
      observedActionCount: nextObservedActionCount,
    },
    "action-started",
  );
};

export const actionCompletedTransition = (
  current: RunSnapshot,
  action?: string,
): StartRunTransition =>
  createPatchedTransition(
    current,
    {
      status: "waiting",
      activeAction: undefined,
      activeStream: undefined,
      statusDetail: undefined,
      lastAction: action,
    },
    "action-completed",
  );

export const messageTransition = (current: RunSnapshot): StartRunTransition =>
  createPatchedTransition(current, { status: "thinking" }, "message");

export const waitingTransition = (current: RunSnapshot): StartRunTransition =>
  createPatchedTransition(
    current,
    {
      status: "waiting",
      activeAction: undefined,
      activeStream: undefined,
      statusDetail: undefined,
    },
    "waiting",
  );

export const thinkingTransition = (current: RunSnapshot): StartRunTransition =>
  createPatchedTransition(current, { status: "thinking" }, "thinking");

export const heartbeatTransition = (
  current: RunSnapshot,
  status: string,
  preview?: string,
  indicatorType?: string,
): StartRunTransition => {
  const nextStatus =
    status === "waiting"
      ? "waiting"
      : status === "error"
        ? "error"
        : status === "acting"
          ? "acting"
          : "thinking";
  return createPatchedTransition(
    current,
    {
      status: nextStatus,
      activeStream: indicatorType ?? current.activeStream,
      statusDetail: preview ?? status,
      lastHeartbeatAt: nowIso(),
    },
    "heartbeat",
  );
};

export const streamTransition = (
  current: RunSnapshot,
  stream: string,
  detail?: string,
): StartRunTransition => {
  if (stream === "action" || stream === "terminal") {
    return createPatchedTransition(
      current,
      {
        status: "acting",
        activeStream: stream,
        activeAction: detail ?? current.activeAction,
        statusDetail: detail,
        lastAction: detail ?? current.lastAction,
      },
      "stream",
    );
  }

  if (stream === "assistant") {
    return createPatchedTransition(
      current,
      {
        status: "waiting",
        activeAction: undefined,
        activeStream: stream,
        statusDetail: detail,
      },
      "stream",
    );
  }

  return createPatchedTransition(
    current,
    {
      status: "thinking",
      activeStream: stream,
      statusDetail: detail,
    },
    "stream",
  );
};

export const finishTransition = (
  current: RunSnapshot,
  status: Extract<RunSnapshot["status"], "complete" | "error">,
  errorMessage?: string,
): StartRunTransition =>
  createPatchedTransition(
    current,
    {
      status,
      activeAction: undefined,
      errorMessage,
      activeStream: undefined,
      statusDetail: undefined,
      endedAt: nowIso(),
    },
    status === "error" ? "error" : "completed",
  );

export const pendingApprovalsTransition = (
  current: RunSnapshot,
  pendingApprovals: number,
): StartRunTransition =>
  createPatchedTransition(current, { pendingApprovals }, "approvals");
