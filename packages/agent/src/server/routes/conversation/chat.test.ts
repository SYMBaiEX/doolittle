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
    config: { agentName: "Doolittle Test", dataDir: "." },
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
      }),
    );
    const reader = response.body?.getReader();
    const firstFrame = reader?.read();
    await vi.waitFor(() => expect(turnSignal).toBeDefined());
    await reader?.cancel();
    await firstFrame;

    expect(turnSignal?.aborted).toBe(true);
  });
});
