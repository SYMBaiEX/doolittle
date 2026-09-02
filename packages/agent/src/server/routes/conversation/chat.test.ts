import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RoomHandlerQueue } from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { RunControllerService } from "@/services/run-controller-service";
import { handleChatRoute, handleChatRunEventsRoute } from "./chat";

const { executeAgentTurnWithProgress } = vi.hoisted(() => ({
  executeAgentTurnWithProgress: vi.fn(),
}));

vi.mock("@/runtime/turn-stream", () => ({
  executeAgentTurnWithProgress,
}));

function createContext(): AppContext {
  return {
    config: {
      agentName: "Doolittle Test",
      dataDir: ".",
      workspaceDir: process.cwd(),
    },
    runtime: { roomHandlerQueue: new RoomHandlerQueue() },
    services: { runController: new RunControllerService() },
  } as unknown as AppContext;
}

function chatRequest(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Request {
  return new Request("http://localhost/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

function rawChatRequest(body: string): Request {
  return new Request("http://localhost/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("handleChatRoute turn lifecycle", () => {
  it("binds a non-streamed turn to the canonical active workspace until completion", async () => {
    const workspaceDir = mkdtempSync(
      join(tmpdir(), "doolittle-chat-workspace-"),
    );
    const context = createContext();
    context.config.workspaceDir = workspaceDir;
    let releaseTurn!: () => void;
    executeAgentTurnWithProgress.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseTurn = () => resolve({ response: "done" });
        }),
    );
    try {
      const response = handleChatRoute(
        context,
        chatRequest({
          message: "inspect this workspace",
          roomId: "workspace-bound",
          runId: "run-workspace-bound",
          workspaceDir,
        }),
      );
      await vi.waitFor(() =>
        expect(
          context.services.runController.workspaceSwitchConflict("/elsewhere"),
        ).toMatchObject({
          runId: "run-workspace-bound",
          workspaceDir: realpathSync(workspaceDir),
        }),
      );

      releaseTurn();
      await response;
      expect(
        context.services.runController.workspaceSwitchConflict("/elsewhere"),
      ).toBeUndefined();
    } finally {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it("rejects a stale desktop workspace identity before executing the turn", async () => {
    const activeWorkspace = mkdtempSync(
      join(tmpdir(), "doolittle-chat-active-"),
    );
    const staleWorkspace = mkdtempSync(join(tmpdir(), "doolittle-chat-stale-"));
    const context = createContext();
    context.config.workspaceDir = activeWorkspace;
    try {
      const response = await handleChatRoute(
        context,
        chatRequest({
          message: "do not retarget me",
          roomId: "workspace-stale",
          workspaceDir: staleWorkspace,
        }),
      );

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        error:
          "The requested chat workspace is no longer active. Switch back to it before sending this message.",
        code: "workspace_mismatch",
      });
      expect(executeAgentTurnWithProgress).not.toHaveBeenCalled();
    } finally {
      rmSync(activeWorkspace, { recursive: true, force: true });
      rmSync(staleWorkspace, { recursive: true, force: true });
    }
  });

  it("releases the workspace identity after a failed turn", async () => {
    const context = createContext();
    executeAgentTurnWithProgress.mockRejectedValue(
      new Error("provider failed"),
    );

    const response = await handleChatRoute(
      context,
      chatRequest({
        message: "fail safely",
        roomId: "workspace-failure",
        runId: "run-workspace-failure",
        workspaceDir: process.cwd(),
      }),
    );
    expect(response.status).toBe(500);
    expect(
      context.services.runController.workspaceSwitchConflict("/elsewhere"),
    ).toBeUndefined();
  });

  it("rejects a concurrent chat that reuses an active run id", async () => {
    const context = createContext();
    let releaseTurn!: () => void;
    executeAgentTurnWithProgress.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseTurn = () => resolve({ response: "done" });
        }),
    );

    const firstResponse = handleChatRoute(
      context,
      chatRequest({
        message: "first turn",
        roomId: "workspace-concurrent",
        runId: "run-workspace-concurrent",
        workspaceDir: process.cwd(),
      }),
    );
    await vi.waitFor(() =>
      expect(executeAgentTurnWithProgress).toHaveBeenCalledTimes(1),
    );

    const duplicateResponse = await handleChatRoute(
      context,
      chatRequest({
        message: "duplicate turn",
        roomId: "workspace-concurrent",
        runId: "run-workspace-concurrent",
        workspaceDir: process.cwd(),
      }),
    );
    expect(duplicateResponse.status).toBe(409);
    await expect(duplicateResponse.json()).resolves.toEqual({
      error: "This chat run already exists.",
      code: "run_already_exists",
    });
    expect(executeAgentTurnWithProgress).toHaveBeenCalledTimes(1);

    releaseTurn();
    await firstResponse;
  });

  it("rejects overlapping runs in the same session without blocking another session", async () => {
    const context = createContext();
    const releases = new Map<string, () => void>();
    executeAgentTurnWithProgress.mockImplementation(
      (input: { runId: string; roomId: string }) =>
        new Promise((resolve) => {
          releases.set(input.runId, () =>
            resolve({ response: "done", sessionId: input.roomId }),
          );
        }),
    );

    const first = handleChatRoute(
      context,
      chatRequest({
        message: "first",
        roomId: "same-room",
        runId: "run-first",
      }),
    );
    await vi.waitFor(() => expect(releases.has("run-first")).toBe(true));
    const conflict = await handleChatRoute(
      context,
      chatRequest({
        message: "second",
        roomId: "same-room",
        runId: "run-second",
      }),
    );
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      code: "session_run_active",
      conflictingRunId: "run-first",
    });

    const parallel = handleChatRoute(
      context,
      chatRequest({
        message: "parallel",
        roomId: "other-room",
        runId: "run-other",
      }),
    );
    await vi.waitFor(() => expect(releases.has("run-other")).toBe(true));
    releases.get("run-first")?.();
    releases.get("run-other")?.();
    await Promise.all([first, parallel]);
  });

  it("assigns a project only when starting a new session", async () => {
    const assignSessionProject = vi.fn(() => true);
    const context = createContext();
    context.services.sessions = {
      countBySessionRole: vi.fn(() => 0),
      assignSessionProject,
    } as never;
    executeAgentTurnWithProgress.mockResolvedValue({ response: "done" });

    await handleChatRoute(
      context,
      chatRequest({
        message: "new session",
        roomId: "new-session",
        projectId: "project-new",
      }),
    );

    expect(assignSessionProject).toHaveBeenCalledWith(
      "new-session",
      "project-new",
    );
  });

  it("does not move an existing session through /chat", async () => {
    const assignSessionProject = vi.fn(() => true);
    const context = createContext();
    context.services.sessions = {
      countBySessionRole: vi.fn(() => 2),
      assignSessionProject,
    } as never;
    executeAgentTurnWithProgress.mockResolvedValue({ response: "done" });

    await handleChatRoute(
      context,
      chatRequest({
        message: "continue",
        roomId: "existing-session",
        projectId: "current-project",
      }),
    );

    expect(assignSessionProject).not.toHaveBeenCalled();
  });

  it.each([
    [
      "malformed JSON",
      rawChatRequest('{"message":'),
      "request body must be valid JSON",
    ],
    [
      "non-object JSON",
      rawChatRequest("[]"),
      "request body must be a JSON object",
    ],
  ])("rejects %s before executing a turn", async (_label, request, error) => {
    const response = await handleChatRoute(createContext(), request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
    expect(executeAgentTurnWithProgress).not.toHaveBeenCalled();
  });

  it.each([
    [{ stream: "yes" }, "stream must be a boolean"],
    [{ roomId: 42 }, "roomId must be a string"],
    [{ userId: { id: "user" } }, "userId must be a string"],
    [{ source: false }, "source must be a string"],
    [
      { attachmentIds: ["ok", 42] },
      "attachmentIds must be an array of strings",
    ],
    [
      { attachmentIds: "not-an-array" },
      "attachmentIds must be an array of strings",
    ],
  ])("rejects invalid payload fields", async (fields, error) => {
    const response = await handleChatRoute(
      createContext(),
      chatRequest({ message: "hello", ...fields }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
    expect(executeAgentTurnWithProgress).not.toHaveBeenCalled();
  });

  it("uses the same fallback room for streamed and non-streamed turns", async () => {
    const context = createContext();
    executeAgentTurnWithProgress.mockResolvedValue({ response: "done" });

    await handleChatRoute(
      context,
      chatRequest({ message: "non-stream", userId: "parity-user" }),
    );
    const streamResponse = await handleChatRoute(
      context,
      chatRequest({ message: "stream", userId: "parity-user", stream: true }),
    );
    await streamResponse.body?.cancel();

    const calls = executeAgentTurnWithProgress.mock.calls;
    expect(calls[0]?.[0]).toMatchObject({ roomId: "api:parity-user" });
    expect(calls[1]?.[0]).toMatchObject({ roomId: "api:parity-user" });
  });

  it("preserves an explicit room ID for both modes", async () => {
    const context = createContext();
    executeAgentTurnWithProgress.mockResolvedValue({ response: "done" });

    await handleChatRoute(
      context,
      chatRequest({ message: "non-stream", roomId: "room-explicit" }),
    );
    const streamResponse = await handleChatRoute(
      context,
      chatRequest({ message: "stream", roomId: "room-explicit", stream: true }),
    );
    await streamResponse.body?.cancel();

    expect(executeAgentTurnWithProgress.mock.calls[0]?.[0]).toMatchObject({
      roomId: "room-explicit",
    });
    expect(executeAgentTurnWithProgress.mock.calls[1]?.[0]).toMatchObject({
      roomId: "room-explicit",
    });
  });

  it("keeps a non-streamed server run alive when its request disconnects", async () => {
    const context = createContext();
    const requestController = new AbortController();
    let turnSignal: AbortSignal | undefined;
    let releaseTurn!: () => void;
    executeAgentTurnWithProgress.mockImplementation(
      (
        _input: unknown,
        _executionContext: unknown,
        hooks: { abortSignal?: AbortSignal },
      ) => {
        turnSignal = hooks.abortSignal;
        return new Promise((resolve) => {
          releaseTurn = () =>
            resolve({ response: "finished", sessionId: "room-disconnect" });
        });
      },
    );

    const response = handleChatRoute(
      context,
      chatRequest(
        {
          message: "cancel me",
          roomId: "room-disconnect",
          runId: "run-disconnect",
        },
        requestController.signal,
      ),
    );
    await vi.waitFor(() => expect(turnSignal).toBeDefined());
    requestController.abort();
    expect(turnSignal?.aborted).toBe(false);
    releaseTurn();
    await expect((await response).json()).resolves.toMatchObject({
      response: "finished",
    });
  });

  it("does not cancel an ordinary completed request", async () => {
    const context = createContext();
    let turnSignal: AbortSignal | undefined;
    executeAgentTurnWithProgress.mockImplementation(
      async (
        _input: unknown,
        _executionContext: unknown,
        hooks: { abortSignal?: AbortSignal },
      ) => {
        turnSignal = hooks.abortSignal;
        return { response: "done", sessionId: "room-normal" };
      },
    );

    const response = await handleChatRoute(
      context,
      chatRequest({ message: "complete", roomId: "room-normal" }),
    );

    expect(turnSignal?.aborted).toBe(false);
    await expect(response.json()).resolves.toMatchObject({ response: "done" });
  });

  it("streams only incremental text deltas and keeps the full answer terminal", async () => {
    const context = createContext();
    executeAgentTurnWithProgress.mockImplementation(
      async (
        _input: unknown,
        _executionContext: unknown,
        hooks: {
          onProgress?: (update: {
            delta: string;
            response: string;
          }) => Promise<void>;
        },
      ) => {
        await hooks.onProgress?.({ delta: "Working…", response: "Working…" });
        await hooks.onProgress?.({
          delta: "Final answer",
          response: "Final answer",
        });
        return { response: "Final answer", sessionId: "room-snapshot" };
      },
    );

    const response = await handleChatRoute(
      context,
      chatRequest({
        message: "replace provisional output",
        roomId: "room-snapshot",
        stream: true,
      }),
    );
    const body = await response.text();
    const updates = body
      .split("\n\n")
      .filter((frame) => frame.startsWith("event: response.output_text.delta"))
      .map((frame) =>
        JSON.parse(frame.split("\n")[1]?.replace("data: ", "") ?? "{}"),
      );

    expect(updates).toMatchObject([
      { delta: "Working…" },
      { delta: "Final answer" },
    ]);
    expect(updates.every((update) => !("response" in update))).toBe(true);
    expect(body).toContain("event: response.completed");
    expect(body).toContain('"response":"Final answer"');
  });

  it("replays only events after the requested cursor and ends at one terminal", async () => {
    const context = createContext();
    context.services.runController.appendTaskEvent(
      "run-replay",
      "response.created",
      {
        run_id: "run-replay",
      },
    );
    context.services.runController.appendTaskEvent(
      "run-replay",
      "response.output_text.delta",
      { delta: "hello" },
    );
    context.services.runController.appendTaskEvent(
      "run-replay",
      "response.completed",
      { response: "hello" },
      true,
    );

    const response = handleChatRunEventsRoute(
      context,
      new Request("http://localhost/chat/runs/run-replay/events?after=1"),
      "run-replay",
    );
    const body = await response.text();
    expect(body).not.toContain("event: response.created");
    expect(body).toContain("event: response.output_text.delta");
    expect(body.match(/event: response.completed/gu)).toHaveLength(1);
    expect(body).toContain('"event_id":2');
    expect(body).toContain('"event_id":3');
  });

  it("returns a failure response when the retained run receipt failed", async () => {
    const context = createContext();
    executeAgentTurnWithProgress.mockResolvedValue({
      response: "provider text",
    });
    vi.spyOn(context.services.runController, "getByRunId").mockReturnValue({
      runId: "run-failed-receipt",
      status: "error",
      errorMessage: "provider failed",
    } as never);

    const response = await handleChatRoute(
      context,
      chatRequest({
        message: "fail truthfully",
        roomId: "room-failed-receipt",
        runId: "run-failed-receipt",
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "The response could not be completed. Please try again.",
      code: "turn_failed",
    });
  });

  it("emits response.failed instead of response.completed for a failed receipt", async () => {
    const context = createContext();
    executeAgentTurnWithProgress.mockResolvedValue({
      response: "provider text",
    });
    vi.spyOn(context.services.runController, "getByRunId").mockReturnValue({
      runId: "run-stream-failed-receipt",
      status: "error",
      errorMessage: "provider failed",
    } as never);

    const response = await handleChatRoute(
      context,
      chatRequest({
        message: "fail truthfully",
        roomId: "room-stream-failed-receipt",
        runId: "run-stream-failed-receipt",
        stream: true,
      }),
    );
    const body = await response.text();

    expect(body).toContain("event: response.failed");
    expect(body).toContain(
      "The response could not be completed. Please try again.",
    );
    expect(body).not.toContain("event: response.completed");
  });

  it("detaches an SSE reader without cancelling the server-owned turn", async () => {
    const context = createContext();
    let turnSignal: AbortSignal | undefined;
    let releaseTurn!: () => void;
    executeAgentTurnWithProgress.mockImplementation(
      (
        _input: unknown,
        _executionContext: unknown,
        hooks: { abortSignal?: AbortSignal },
      ) => {
        turnSignal = hooks.abortSignal;
        return new Promise((resolve) => {
          releaseTurn = () =>
            resolve({ response: "finished", sessionId: "room-stream" });
        });
      },
    );

    const response = await handleChatRoute(
      context,
      chatRequest({
        message: "stream then cancel",
        roomId: "room-stream",
        runId: "run-stream",
        stream: true,
        workspaceDir: process.cwd(),
      }),
    );
    const reader = response.body?.getReader();
    const firstFrame = reader?.read();
    await vi.waitFor(() => expect(turnSignal).toBeDefined());
    expect(
      context.services.runController.workspaceSwitchConflict("/elsewhere"),
    ).toMatchObject({ runId: "run-stream" });
    await reader?.cancel();
    await firstFrame;

    expect(turnSignal?.aborted).toBe(false);
    expect(context.services.runController.isTaskActive("run-stream")).toBe(
      true,
    );
    releaseTurn();
    await vi.waitFor(() =>
      expect(
        context.services.runController.workspaceSwitchConflict("/elsewhere"),
      ).toBeUndefined(),
    );
    expect(
      context.services.runController.getTerminalTaskEvent("run-stream"),
    ).toMatchObject({ type: "response.completed", terminal: true });
  });
});
