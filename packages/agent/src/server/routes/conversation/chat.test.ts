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

afterEach(() => {
  vi.resetAllMocks();
});

describe("handleChatRoute turn lifecycle", () => {
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
