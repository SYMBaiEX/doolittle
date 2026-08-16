import { describe, expect, it, vi } from "vitest";
import type { RunUpdateEvent } from "@/services/run-controller-service";

let publishRunUpdate:
  | ((event: RunUpdateEvent) => void | Promise<void>)
  | undefined;
let observedAbortSignal: AbortSignal | undefined;
let observedTurnInput: { runId?: string } | undefined;
let observedRunId = "";

vi.doMock("@/runtime/chat", () => ({
  handleAgentTurn: async (
    input: { runId?: string },
    _context: unknown,
    options?: { abortSignal?: AbortSignal },
  ) => {
    observedTurnInput = input;
    observedRunId = input.runId ?? "";
    observedAbortSignal = options?.abortSignal;
    const baseRun = {
      runId: "other-run",
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
    await publishRunUpdate?.({
      type: "message",
      sessionId: "room-1",
      run: { ...baseRun, runId: input.runId ?? "missing-run-id" },
    });
    return "done";
  },
}));

describe("executeAgentTurnWithProgress", () => {
  it("forwards only updates for the exact streamed run", async () => {
    const unsubscribe = vi.fn(() => undefined);
    const rawUpdates: RunUpdateEvent[] = [];
    const proseUpdates: RunUpdateEvent[] = [];
    const { executeAgentTurnWithProgress } = await import("./turn-stream");

    const result = await executeAgentTurnWithProgress(
      {
        message: "hello",
        userId: "desktop-user",
        roomId: "room-1",
        runId: "matching-run",
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
    expect(observedTurnInput?.runId).toBe("matching-run");
    expect(rawUpdates.map((event) => event.run.runId)).toEqual([
      "matching-run",
    ]);
    expect(proseUpdates).toEqual([]);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("generates one route-safe run id shared by execution and progress filtering", async () => {
    observedTurnInput = undefined;
    observedRunId = "";
    const rawUpdates: RunUpdateEvent[] = [];
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
          runController: {
            onUpdate: (
              listener: (event: RunUpdateEvent) => void | Promise<void>,
            ) => {
              publishRunUpdate = listener;
              return () => undefined;
            },
          },
        } as never,
      },
      {
        onRunUpdate: (event) => {
          rawUpdates.push(event);
        },
      },
    );

    expect(observedTurnInput).toMatchObject({
      runId: expect.stringMatching(/^[a-zA-Z0-9:_-]{1,128}$/u),
    });
    expect(rawUpdates).toHaveLength(1);
    expect(rawUpdates[0]?.run.runId).toBe(observedRunId);
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
