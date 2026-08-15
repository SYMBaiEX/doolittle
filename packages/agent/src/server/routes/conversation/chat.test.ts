import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RoomHandlerQueue } from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { RunControllerService } from "@/services/run-controller-service";
import { handleChatRoute } from "./chat";

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

    await expect(
      handleChatRoute(
        context,
        chatRequest({
          message: "fail safely",
          roomId: "workspace-failure",
          runId: "run-workspace-failure",
          workspaceDir: process.cwd(),
        }),
      ),
    ).rejects.toThrow("provider failed");
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
      error: "This chat run is already active.",
      code: "run_already_active",
    });
    expect(executeAgentTurnWithProgress).toHaveBeenCalledTimes(1);

    releaseTurn();
    await firstResponse;
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

  it("propagates request disconnect cancellation into the active turn", async () => {
    const context = createContext();
    const requestController = new AbortController();
    let turnSignal: AbortSignal | undefined;
    executeAgentTurnWithProgress.mockImplementation(
      async (
        _input: unknown,
        _executionContext: unknown,
        hooks: { abortSignal?: AbortSignal },
      ) => {
        turnSignal = hooks.abortSignal;
        await new Promise<void>((resolve) => {
          hooks.abortSignal?.addEventListener("abort", () => resolve(), {
            once: true,
          });
        });
        return { response: "", sessionId: "room-disconnect" };
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
    await response;

    expect(turnSignal?.aborted).toBe(true);
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

  it("cancels the same turn controller when an SSE reader disconnects", async () => {
    const context = createContext();
    let turnSignal: AbortSignal | undefined;
    executeAgentTurnWithProgress.mockImplementation(
      async (
        _input: unknown,
        _executionContext: unknown,
        hooks: { abortSignal?: AbortSignal },
      ) => {
        turnSignal = hooks.abortSignal;
        await new Promise<void>((resolve) => {
          hooks.abortSignal?.addEventListener("abort", () => resolve(), {
            once: true,
          });
        });
        return { response: "", sessionId: "room-stream" };
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

    expect(turnSignal?.aborted).toBe(true);
    await vi.waitFor(() =>
      expect(
        context.services.runController.workspaceSwitchConflict("/elsewhere"),
      ).toBeUndefined(),
    );
  });
});
