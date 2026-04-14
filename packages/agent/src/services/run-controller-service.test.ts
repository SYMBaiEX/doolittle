import { describe, expect, it } from "bun:test";
import { RunControllerService } from "./run-controller-service";

describe("RunControllerService", () => {
  it("tracks observed action steps for a single turn", () => {
    const service = new RunControllerService();
    service.startTurn({
      sessionId: "session-a",
      roomId: "room-a",
      runId: "run-a",
      source: "cli",
      message: "search the repo",
      runDepth: "standard",
      configuredMaxIterations: 45,
      progressMode: "new",
    });

    service.noteActionStarted("session-a", "workspace:search");
    service.noteActionCompleted("session-a", "workspace:search");

    const active = service.getActive("session-a");
    expect(active?.observedActionCount).toBe(1);
    expect(active?.lastAction).toBe("workspace:search");
    expect(active?.status).toBe("waiting");
  });

  it("resets the tracked run when a new turn starts for the same session", () => {
    const service = new RunControllerService();
    service.startTurn({
      sessionId: "session-a",
      roomId: "room-a",
      runId: "run-a",
      source: "cli",
      message: "first task",
      runDepth: "quick",
      configuredMaxIterations: 15,
      progressMode: "new",
    });
    service.noteActionStarted("session-a", "repo:status");

    service.startTurn({
      sessionId: "session-a",
      roomId: "room-a",
      runId: "run-b",
      source: "cli",
      message: "second task",
      runDepth: "deep",
      configuredMaxIterations: 90,
      progressMode: "verbose",
    });

    const active = service.getActive("session-a");
    expect(active?.runId).toBe("run-b");
    expect(active?.message).toBe("second task");
    expect(active?.observedActionCount).toBe(0);
    expect(active?.configuredMaxIterations).toBe(90);
    expect(active?.progressMode).toBe("verbose");
  });

  it("maps runtime room events back to the active session", () => {
    const service = new RunControllerService();
    service.startTurn({
      sessionId: "session-a",
      roomId: "room-a",
      runId: "run-a",
      source: "telegram",
      message: "inspect logs",
      runDepth: "explore",
      configuredMaxIterations: 150,
      progressMode: "all",
    });

    service.noteRuntimeActionStarted("room-a", "shell:tail");
    service.noteRuntimeActionCompleted("room-a", "shell:tail");
    service.finishRuntimeRun("room-a", "complete");

    const active = service.getByRoomId("room-a");
    expect(active?.observedActionCount).toBe(1);
    expect(active?.status).toBe("complete");
    expect(active?.endedAt).toBeDefined();
  });

  it("captures native agent-event streams and heartbeats without faking extra steps", () => {
    const service = new RunControllerService();
    service.startTurn({
      sessionId: "session-a",
      roomId: "room-a",
      runId: "run-a",
      source: "cli",
      message: "find the auth flow",
      runDepth: "standard",
      configuredMaxIterations: 45,
      progressMode: "verbose",
    });

    service.noteRuntimeStream("room-a", "thought", "searching the workspace");
    service.noteHeartbeat("thinking", "warming native tools", "autonomy");
    service.noteRuntimeStream("room-a", "terminal", "rg linked provider auth");

    const active = service.getActive("session-a");
    expect(active?.observedActionCount).toBe(0);
    expect(active?.status).toBe("acting");
    expect(active?.activeStream).toBe("terminal");
    expect(active?.activeAction).toBe("rg linked provider auth");
    expect(active?.lastHeartbeatAt).toBeDefined();
  });

  it("emits lifecycle updates as turns reset and complete", () => {
    const service = new RunControllerService();
    const observed: string[] = [];
    const unsubscribe = service.onUpdate((event) => {
      observed.push(event.type);
    });

    service.startTurn({
      sessionId: "session-a",
      roomId: "room-a",
      runId: "run-a",
      source: "cli",
      message: "first task",
      runDepth: "quick",
      configuredMaxIterations: 15,
      progressMode: "new",
    });
    service.startTurn({
      sessionId: "session-a",
      roomId: "room-a",
      runId: "run-b",
      source: "cli",
      message: "second task",
      runDepth: "deep",
      configuredMaxIterations: 90,
      progressMode: "verbose",
    });
    service.finishTurn("session-a", "error", "boom");
    unsubscribe();

    expect(observed).toEqual(["started", "completed", "started", "error"]);
  });
});
