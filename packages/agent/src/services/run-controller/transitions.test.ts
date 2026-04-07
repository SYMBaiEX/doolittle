import { describe, expect, it } from "bun:test";
import {
  actionCompletedTransition,
  actionStartedTransition,
  createPatchedTransition,
  createRunStartTransition,
  finishTransition,
  heartbeatTransition,
  messageTransition,
  streamTransition,
  thinkingTransition,
  waitingTransition,
} from "./transitions";
import type { RunSnapshot, StartTurnInput } from "./types";

const baseCurrent: RunSnapshot = {
  runId: "run-a",
  sessionId: "session-a",
  roomId: "room-a",
  source: "cli",
  message: "start work",
  runDepth: "standard",
  configuredMaxIterations: 45,
  observedActionCount: 0,
  progressMode: "new",
  status: "thinking",
  pendingApprovals: 0,
  startedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("run-controller/transitions", () => {
  it("creates a started transition from turn input", () => {
    const input: StartTurnInput = {
      sessionId: "session-a",
      roomId: "room-a",
      runId: "run-a",
      source: "cli",
      message: "start work",
      runDepth: "standard",
      configuredMaxIterations: 45,
      progressMode: "new",
      pendingApprovals: 2,
    };

    const transition = createRunStartTransition(input);

    expect(transition.type).toBe("started");
    expect(transition.run).toMatchObject({
      sessionId: "session-a",
      runId: "run-a",
      status: "thinking",
      observedActionCount: 0,
      pendingApprovals: 2,
    });
    expect(transition.run.startedAt).toBeTruthy();
    expect(transition.run.updatedAt).toBeTruthy();
  });

  it("merges patches and updates timestamps on patched transitions", () => {
    const transition = createPatchedTransition(
      baseCurrent,
      { status: "waiting" },
      "waiting",
    );
    expect(transition.type).toBe("waiting");
    expect(transition.run).toMatchObject({
      status: "waiting",
      runId: "run-a",
      sessionId: "session-a",
    });
    expect(transition.run.updatedAt).toBeTruthy();
  });

  it("increments action count and switches to acting for action start", () => {
    const transition = actionStartedTransition(baseCurrent, "workspace:search");
    expect(transition.type).toBe("action-started");
    expect(transition.run.status).toBe("acting");
    expect(transition.run.observedActionCount).toBe(1);
    expect(transition.run.activeAction).toBe("workspace:search");
  });

  it("moves to waiting and clears action state on action completed", () => {
    const started = actionStartedTransition(baseCurrent, "workspace:search");
    const completed = actionCompletedTransition(
      started.run,
      "workspace:search",
    );
    expect(completed.type).toBe("action-completed");
    expect(completed.run.status).toBe("waiting");
    expect(completed.run.activeAction).toBeUndefined();
    expect(completed.run.activeStream).toBeUndefined();
    expect(completed.run.lastAction).toBe("workspace:search");
  });

  it("maps stream events by stream type", () => {
    const actionStream = streamTransition(
      baseCurrent,
      "action",
      "workspace:search",
    );
    const terminalStream = streamTransition(baseCurrent, "terminal", "rg -n");
    const assistantStream = streamTransition(baseCurrent, "assistant", "reply");
    const thoughtStream = streamTransition(baseCurrent, "thought", "planning");

    expect(actionStream.run.status).toBe("acting");
    expect(actionStream.run.activeStream).toBe("action");
    expect(terminalStream.run.status).toBe("acting");
    expect(terminalStream.run.activeStream).toBe("terminal");
    expect(assistantStream.run.status).toBe("waiting");
    expect(assistantStream.run.activeStream).toBe("assistant");
    expect(thoughtStream.run.status).toBe("thinking");
    expect(thoughtStream.run.activeStream).toBe("thought");
  });

  it("maps finish outcomes and emits completion event types", () => {
    const completed = finishTransition(baseCurrent, "complete");
    const errored = finishTransition(baseCurrent, "error", "boom");

    expect(completed.type).toBe("completed");
    expect(completed.run.status).toBe("complete");
    expect(completed.run.endedAt).toBeTruthy();
    expect(errored.type).toBe("error");
    expect(errored.run.status).toBe("error");
    expect(errored.run.errorMessage).toBe("boom");
  });

  it("handles heartbeat and message/waiting/thinking transitions", () => {
    const heartbeat = heartbeatTransition(
      baseCurrent,
      "acting",
      "running",
      "action",
    );
    const waiting = waitingTransition(baseCurrent);
    const thinking = thinkingTransition(baseCurrent);
    const message = messageTransition(baseCurrent);

    expect(heartbeat.type).toBe("heartbeat");
    expect(heartbeat.run.status).toBe("acting");
    expect(heartbeat.run.lastHeartbeatAt).toBeTruthy();
    expect(heartbeat.run.activeStream).toBe("action");
    expect(heartbeat.run.statusDetail).toBe("running");

    expect(waiting.type).toBe("waiting");
    expect(waiting.run.status).toBe("waiting");
    expect(waiting.run.activeAction).toBeUndefined();
    expect(thinking.type).toBe("thinking");
    expect(thinking.run.status).toBe("thinking");
    expect(message.type).toBe("message");
    expect(message.run.status).toBe("thinking");
  });
});
