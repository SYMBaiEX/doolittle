import { describe, expect, it, vi } from "vitest";
import type { RunUpdateEvent } from "@/services/run-controller-service";

let publishRunUpdate:
  | ((event: RunUpdateEvent) => void | Promise<void>)
  | undefined;
let observedAbortSignal: AbortSignal | undefined;

vi.doMock("@/runtime/chat", () => ({
  handleAgentTurn: async (
    _input: unknown,
    _context: unknown,
    options?: { abortSignal?: AbortSignal },
  ) => {
    observedAbortSignal = options?.abortSignal;
    const baseRun = {
      runId: "run-1",
      sessionId: "room-1",
      roomId: "room-1",
      source: "desktop",
      message: "hello",
      runDepth: "standard",
      configuredMaxIterations: 45,
      observedActionCount: 0,
      progressMode: "off",
      status: "thinking",
      localMutations: [],
      pendingApprovals: 0,
      startedAt: "2026-07-27T12:00:00.000Z",
      updatedAt: "2026-07-27T12:00:01.000Z",
    } satisfies RunUpdateEvent["run"];

    await publishRunUpdate?.({
      type: "thinking",
      sessionId: "another-room",
      run: {
        ...baseRun,
        sessionId: "another-room",
        roomId: "another-room",
      },
    });
    await publishRunUpdate?.({
      type: "message",
      sessionId: "room-1",
      run: baseRun,
    });
    return "done";
  },
}));

describe("executeAgentTurnWithProgress", () => {
  it("delivers matching raw run updates before prose filtering", async () => {
    const unsubscribe = vi.fn(() => undefined);
    const rawUpdates: RunUpdateEvent[] = [];
    const proseUpdates: RunUpdateEvent[] = [];
    const { executeAgentTurnWithProgress } = await import("./turn-stream");

    const result = await executeAgentTurnWithProgress(
      {
        message: "hello",
        userId: "desktop-user",
        roomId: "room-1",
        source: "desktop",
      },
      {
        config: {} as never,
        runtime: {} as never,
        services: {
          runController: {
            onUpdate: (
              listener: (event: RunUpdateEvent) => void | Promise<void>,
            ) => {
              publishRunUpdate = listener;
              return unsubscribe;
            },
          },
        } as never,
      },
      {
        onRunUpdate: (event) => {
          rawUpdates.push(event);
        },
        onRunEvent: (event) => {
          proseUpdates.push(event);
        },
      },
    );

    expect(result).toEqual({ response: "done", sessionId: "room-1" });
    expect(rawUpdates.map((event) => event.type)).toEqual(["message"]);
    expect(proseUpdates).toEqual([]);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("passes the server cancellation signal into the provider turn", async () => {
    observedAbortSignal = undefined;
    const controller = new AbortController();
    const { executeAgentTurnWithProgress } = await import("./turn-stream");

    await executeAgentTurnWithProgress(
      {
        message: "hello",
        userId: "desktop-user",
        roomId: "room-1",
        source: "desktop",
      },
      {
        config: {} as never,
        runtime: {} as never,
        services: {
          runController: { onUpdate: () => () => undefined },
        } as never,
      },
      { abortSignal: controller.signal },
    );

    expect(observedAbortSignal === controller.signal).toBe(true);
  });
});
