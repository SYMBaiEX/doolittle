import { describe, expect, it } from "vitest";
import { RunControllerService } from "./run-controller-service";

describe("RunControllerService", () => {
  it("blocks a different workspace until the registered run releases its identity", () => {
    const service = new RunControllerService();
    const release = service.registerWorkspaceRun("run-a", "/workspace/a");

    expect(service.workspaceSwitchConflict("/workspace/a")).toBeUndefined();
    expect(service.workspaceSwitchConflict("/workspace/b")).toEqual({
      runId: "run-a",
      workspaceDir: "/workspace/a",
    });

    release();
    expect(service.workspaceSwitchConflict("/workspace/b")).toBeUndefined();
  });

  it("rejects duplicate workspace registration without releasing the first run", () => {
    const service = new RunControllerService();
    service.registerWorkspaceRun("run-a", "/workspace/a");

    expect(() => service.registerWorkspaceRun("run-a", "/workspace/b")).toThrow(
      "Workspace identity is already registered for run run-a.",
    );
    expect(service.workspaceSwitchConflict("/workspace/b")).toEqual({
      runId: "run-a",
      workspaceDir: "/workspace/a",
    });
  });

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

  it("aborts the registered server-side signal and retains a cancelled receipt", () => {
    const service = new RunControllerService();
    const controller = new AbortController();
    service.startTurn({
      sessionId: "session-cancel",
      roomId: "room-cancel",
      runId: "run-cancel",
      source: "desktop",
      message: "stop this provider turn",
      runDepth: "standard",
      configuredMaxIterations: 45,
      progressMode: "new",
    });
    service.registerAbortController("run-cancel", controller);

    const result = service.cancelRun("run-cancel");

    expect(result.accepted).toBe(true);
    expect(controller.signal.aborted).toBe(true);
    expect(result.run).toMatchObject({
      runId: "run-cancel",
      status: "cancelled",
      terminalReason: "cancelled",
    });
    expect(service.getByRunId("run-cancel")).toMatchObject({
      endedAt: expect.any(String),
      status: "cancelled",
    });
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

  it("records local mutation receipts by runtime room", () => {
    const service = new RunControllerService();
    const observed: string[] = [];
    service.onUpdate((event) => {
      observed.push(event.type);
    });
    service.startTurn({
      sessionId: "session-a",
      roomId: "room-a",
      runId: "run-a",
      source: "cli",
      message: "write a file",
      runDepth: "standard",
      configuredMaxIterations: 45,
      progressMode: "verbose",
    });

    service.recordRuntimeLocalMutation("room-a", {
      action: "WRITE_FILE",
      requestedPath: "developer/dev/example-app/index.html",
      resolvedPath: "/Users/developer/dev/example-app/index.html",
      success: true,
      message: "Wrote: /Users/developer/dev/example-app/index.html",
      bytes: 42,
    });

    const active = service.getActive("session-a");
    expect(observed).toContain("local-mutation");
    expect(active?.localMutations).toMatchObject([
      {
        action: "WRITE_FILE",
        success: true,
        bytes: 42,
      },
    ]);
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

  it("does not report terminal receipts as active runs", () => {
    const service = new RunControllerService();
    service.startTurn({
      sessionId: "session-active",
      roomId: "room-active",
      runId: "run-active",
      source: "desktop",
      message: "finish this turn",
      runDepth: "standard",
      configuredMaxIterations: 45,
      progressMode: "new",
    });

    service.finishTurn("session-active", "complete");

    expect(service.getActive("session-active")).toBeUndefined();
    expect(service.listActive()).toEqual([]);
    expect(service.getByRunId("run-active")).toMatchObject({
      runId: "run-active",
      status: "complete",
      terminalReason: "completed",
      endedAt: expect.any(String),
    });
  });
});
