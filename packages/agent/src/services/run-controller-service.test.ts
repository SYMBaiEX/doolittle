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

  it("claims one active run per session while allowing other sessions in parallel", () => {
    const service = new RunControllerService();
    expect(
      service.claimTaskRun({
        runId: "run-a",
        responseId: "response-a",
        roomId: "room-a",
        sessionId: "session-a",
        source: "desktop",
      }),
    ).toEqual({ accepted: true });
    expect(
      service.claimTaskRun({
        runId: "run-b",
        responseId: "response-b",
        roomId: "room-a",
        sessionId: "session-a",
        source: "desktop",
      }),
    ).toEqual({
      accepted: false,
      reason: "session_active",
      conflictingRunId: "run-a",
    });
    expect(
      service.claimTaskRun({
        runId: "run-c",
        responseId: "response-c",
        roomId: "room-c",
        sessionId: "session-c",
        source: "desktop",
      }),
    ).toEqual({ accepted: true });
  });

  it("rejects a task claim when a non-task turn already owns the session", () => {
    const service = new RunControllerService();
    service.startTurn({
      sessionId: "session-owned",
      roomId: "room-owned",
      runId: "run-native",
      source: "cli",
      message: "already running",
      runDepth: "standard",
      configuredMaxIterations: 45,
      progressMode: "new",
    });

    expect(
      service.claimTaskRun({
        runId: "run-task",
        responseId: "response-task",
        roomId: "room-owned",
        sessionId: "session-owned",
        source: "desktop",
      }),
    ).toEqual({
      accepted: false,
      reason: "session_active",
      conflictingRunId: "run-native",
    });
  });

  it("cancels only the requested task and appends one terminal event", () => {
    const service = new RunControllerService();
    const controllerA = new AbortController();
    const controllerB = new AbortController();
    for (const suffix of ["a", "b"] as const) {
      expect(
        service.claimTaskRun({
          runId: `run-${suffix}`,
          responseId: `response-${suffix}`,
          roomId: `room-${suffix}`,
          sessionId: `session-${suffix}`,
          source: "desktop",
        }),
      ).toEqual({ accepted: true });
    }
    service.appendTaskEvent("run-a", "response.created", { run_id: "run-a" });
    service.appendTaskEvent("run-b", "response.created", { run_id: "run-b" });
    service.registerAbortController("run-a", controllerA);
    service.registerAbortController("run-b", controllerB);

    expect(service.cancelRun("run-a").accepted).toBe(true);
    expect(service.cancelRun("run-a").accepted).toBe(true);
    expect(controllerA.signal.aborted).toBe(true);
    expect(controllerB.signal.aborted).toBe(false);
    expect(
      service.getTaskEvents("run-a").filter((event) => event.terminal),
    ).toMatchObject([{ type: "response.cancelled", terminal: true }]);
    expect(service.getTerminalTaskEvent("run-b")).toBeUndefined();
  });

  it("does not abort a controller after the task journal is already complete", () => {
    const service = new RunControllerService();
    const controller = new AbortController();
    expect(
      service.claimTaskRun({
        runId: "run-complete",
        responseId: "response-complete",
        roomId: "room-complete",
        sessionId: "session-complete",
        source: "desktop",
      }),
    ).toEqual({ accepted: true });
    service.appendTaskEvent("run-complete", "response.created", {});
    service.appendTaskEvent("run-complete", "response.completed", {}, true);
    service.registerAbortController("run-complete", controller);

    expect(service.cancelRun("run-complete").accepted).toBe(true);
    expect(controller.signal.aborted).toBe(false);
    expect(service.getTerminalTaskEvent("run-complete")?.type).toBe(
      "response.completed",
    );
  });

  it("rejects a new turn while the same session still has an active run", () => {
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

    expect(() =>
      service.startTurn({
        sessionId: "session-a",
        roomId: "room-a",
        runId: "run-b",
        source: "cli",
        message: "second task",
        runDepth: "deep",
        configuredMaxIterations: 90,
        progressMode: "verbose",
      }),
    ).toThrow("Session session-a already has active run run-a.");

    const active = service.getActive("session-a");
    expect(active?.runId).toBe("run-a");
    expect(active?.observedActionCount).toBe(1);
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

  it("emits lifecycle updates only for accepted turns", () => {
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
    service.finishTurn("session-a", "error", "boom");
    unsubscribe();

    expect(observed).toEqual(["started", "error"]);
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
