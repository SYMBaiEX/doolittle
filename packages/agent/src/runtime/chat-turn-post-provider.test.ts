import { EventType } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { createRunProgressEvents } from "@/runtime/bootstrap/runtime/run-progress";
import type { AgentExecutionContext } from "@/runtime/chat";
import { runPostProviderTurn } from "./chat-turn/post-provider";

function createHarness(observedActionCount = 0) {
  const storedMessages: string[] = [];
  const finishEvents: Array<{ status: string; message?: string }> = [];
  const trajectoryEvents: unknown[] = [];
  const context = {
    runtime: {},
    services: {
      runController: {
        getActive: () => ({
          observedActionCount,
          localMutations: [],
        }),
        finishTurn: (_sessionId: string, status: string, message?: string) =>
          finishEvents.push({ status, message }),
      },
      sessions: {
        countBySessionRole: () => 1,
        storeMessage: (message: { text: string }) =>
          storedMessages.push(message.text),
      },
      trajectories: {
        recordEvent: (event: unknown) => trajectoryEvents.push(event),
      },
    },
    config: {},
  } as unknown as AgentExecutionContext;

  return { context, finishEvents, storedMessages, trajectoryEvents };
}

function createInput(
  context: AgentExecutionContext,
  overrides: Partial<Parameters<typeof runPostProviderTurn>[0]> = {},
): Parameters<typeof runPostProviderTurn>[0] {
  return {
    input: {
      userId: "alice",
      message: "Tell me about this project",
      source: "desktop",
    },
    effectiveInput: {
      userId: "alice",
      message: "Tell me about this project",
      source: "desktop",
    },
    context,
    turn: {
      sessionId: "session-1",
      roomId: "room-1",
      entityId: "entity-1",
      localInteractive: true,
      connectionSource: "desktop",
      runId: "run-1",
    } as Parameters<typeof runPostProviderTurn>[0]["turn"],
    response: "This is the selected project.",
    settingsDuring: {
      model: {
        provider: "openai",
        model: "gpt-4.1",
      },
    } as Parameters<typeof runPostProviderTurn>[0]["settingsDuring"],
    scheduleProfileObservation: vi.fn(),
    ...overrides,
  };
}

describe("ElizaOS-native post-provider seam", () => {
  it("projects the SDK response into Doolittle session and run state", async () => {
    const harness = createHarness();
    const scheduleProfileObservation = vi.fn();

    const result = await runPostProviderTurn(
      createInput(harness.context, { scheduleProfileObservation }),
    );

    expect(result).toEqual({
      kind: "final",
      response: "This is the selected project.",
      runFailureMessage: undefined,
      observedActionCount: 0,
      usedFallback: false,
    });
    expect(harness.storedMessages).toEqual(["This is the selected project."]);
    expect(harness.finishEvents).toEqual([
      { status: "complete", message: undefined },
    ]);
    expect(scheduleProfileObservation).toHaveBeenCalledTimes(1);
  });

  it("finalizes the turn when a post-provider notice callback rejects", async () => {
    const harness = createHarness();
    harness.context.services.contextCompression = {
      isApproachingLimit: () => true,
      measure: () => ({ usageFraction: 0.9, estimatedTokens: 900 }),
    } as never;
    harness.context.services.sessions.recentBySession = vi.fn(() =>
      Array.from({ length: 4 }, () => ({}) as never),
    );

    const result = await runPostProviderTurn(
      createInput(harness.context, {
        options: {
          onNotice: async () => {
            throw new Error("notice transport closed");
          },
        },
      }),
    );

    expect(result.response).toBe("This is the selected project.");
    expect(harness.storedMessages).toContain("This is the selected project.");
    expect(harness.finishEvents).toEqual([{ status: "complete" }]);
  });

  it("publishes exactly the persisted terminal response", async () => {
    const harness = createHarness();
    const progress: Array<{ chunk: string; response: string; phase: string }> =
      [];

    await runPostProviderTurn(
      createInput(harness.context, {
        options: {
          onResponseProgress: async (update) => {
            progress.push(update);
          },
        },
      }),
    );

    expect(progress).toEqual([
      {
        chunk: "This is the selected project.",
        response: "This is the selected project.",
        phase: "model",
      },
    ]);
    expect(harness.storedMessages).toEqual(["This is the selected project."]);
  });

  it("never projects an early native preamble as the terminal tool response", async () => {
    const harness = createHarness();

    const result = await runPostProviderTurn(
      createInput(harness.context, {
        response: "",
        actionResults: [
          {
            success: true,
            data: { actionName: "WEB_SEARCH" },
          },
        ],
        nativeResponseMessages: [
          {
            id: "early-response",
            content: {
              text: "I don't have a web-search tool available.",
            },
          },
        ] as Parameters<
          typeof runPostProviderTurn
        >[0]["nativeResponseMessages"],
      }),
    );

    expect(result.response).not.toContain("don't have a web-search tool");
    expect(harness.storedMessages).toEqual([result.response]);
  });

  it("does not run a second executor after an SDK failure", async () => {
    const harness = createHarness();

    const result = await runPostProviderTurn(
      createInput(harness.context, {
        response: "The native planner could not complete this turn.",
        runFailureMessage: "The native planner could not complete this turn.",
      }),
    );

    expect(result).toMatchObject({
      kind: "final",
      usedFallback: false,
      runFailureMessage: "The native planner could not complete this turn.",
    });
    expect(harness.finishEvents).toEqual([
      {
        status: "error",
        message: "The native planner could not complete this turn.",
      },
    ]);
  });

  it("leaves autonomous terminal receipts to native RUN_ENDED", async () => {
    const harness = createHarness();

    await runPostProviderTurn(
      createInput(harness.context, {
        input: {
          userId: "alice",
          message: "Run the scheduled task",
          source: "automation",
        },
        effectiveInput: {
          userId: "alice",
          message: "Run the scheduled task",
          source: "automation",
        },
        turn: {
          ...createInput(harness.context).turn,
          connectionSource: "automation",
        },
      }),
    );

    expect(harness.finishEvents).toEqual([]);
  });

  it("defers a chat RUN_ENDED receipt until the post-provider contract failure is finalized", async () => {
    const harness = createHarness();
    const nativeFinishRuntimeRun = vi.fn();
    const events = createRunProgressEvents({
      runController: {
        getByRoomId: () => ({ runId: "run-1", source: "desktop" }),
        finishRuntimeRun: nativeFinishRuntimeRun,
      },
    } as never);

    await events[EventType.RUN_ENDED]?.[0]?.({
      roomId: "room-1",
      runId: "run-1",
      status: "completed",
    } as never);
    const result = await runPostProviderTurn(
      createInput(harness.context, {
        response: "Done.",
        actionResults: [
          {
            success: true,
            data: {
              mutationAction: "WRITE_FILE",
              mutationKind: "local-file",
              mutation: { action: "WRITE_FILE", success: false },
            },
          },
        ],
      }),
    );

    expect(nativeFinishRuntimeRun).not.toHaveBeenCalled();
    expect(harness.finishEvents).toEqual([
      { status: "error", message: result.runFailureMessage },
    ]);
    expect(harness.trajectoryEvents).toEqual([
      expect.objectContaining({
        category: "turn",
        event: "turn.failed",
        sessionId: "session-1",
        runId: "run-1",
        roomId: "room-1",
        source: "desktop",
        provider: "openai",
        model: "gpt-4.1",
        metadata: expect.objectContaining({
          response: result.response,
          observedActionCount: 1,
          actionResults: expect.arrayContaining([
            expect.objectContaining({ success: true }),
          ]),
          localMutations: expect.arrayContaining([
            expect.objectContaining({ action: "WRITE_FILE", success: false }),
          ]),
          usedFallback: false,
          runFailureMessage: result.runFailureMessage,
        }),
      }),
    ]);
  });

  it("rejects a selected local file mutation whose receipt reports failure", async () => {
    const harness = createHarness();
    const message = "create a website file in this project";

    const result = await runPostProviderTurn(
      createInput(harness.context, {
        input: { userId: "alice", message, source: "desktop" },
        effectiveInput: { userId: "alice", message, source: "desktop" },
        response: "Done.",
        actionResults: [
          {
            success: true,
            data: {
              mutationAction: "WRITE_FILE",
              mutationKind: "local-file",
              mutation: { action: "WRITE_FILE", success: false },
            },
          },
        ],
      }),
    );

    expect(result.runFailureMessage).toContain(
      "No verified local mutation receipt was recorded (WRITE_FILE)",
    );
    expect(harness.finishEvents[0]?.status).toBe("error");
  });

  // Regression: ActionResults reconstructed from a stream envelope carry a
  // synthesized `actionName` (the tool-call name) but no mutation receipt.
  // Arming the contract from that field made every such turn fail, replacing
  // the agent's real answer with "Native execution failed" even when the write
  // succeeded — which read to users as "the agent cannot write code".
  it("does not arm the mutation contract from a synthesized actionName", async () => {
    const harness = createHarness();
    const message = "create a website file in this project";

    const result = await runPostProviderTurn(
      createInput(harness.context, {
        input: { userId: "alice", message, source: "desktop" },
        effectiveInput: { userId: "alice", message, source: "desktop" },
        response: "Done.",
        actionResults: [
          {
            success: true,
            data: { actionName: "WRITE_FILE" },
          },
        ],
      }),
    );

    expect(result.runFailureMessage).toBeUndefined();
    expect(harness.finishEvents[0]?.status).not.toBe("error");
  });

  it("rejects a progress-only terminal reply when an explicit mutation never ran", async () => {
    const harness = createHarness(2);
    const message = "create a website file in this project";

    const result = await runPostProviderTurn(
      createInput(harness.context, {
        input: { userId: "alice", message, source: "desktop" },
        effectiveInput: { userId: "alice", message, source: "desktop" },
        response: "🔎 Provider executed: []",
      }),
    );

    expect(result).toMatchObject({ kind: "final" });
    expect(result.response).toContain(
      "I stopped before completing the requested workspace change",
    );
    expect(result.runFailureMessage).toBe(result.response);
    expect(harness.finishEvents[0]?.status).toBe("error");
  });

  it("accepts a file change backed by the official ActionResult contract", async () => {
    const harness = createHarness();
    const message = "create a website file in this project";

    const result = await runPostProviderTurn(
      createInput(harness.context, {
        input: { userId: "alice", message, source: "desktop" },
        effectiveInput: { userId: "alice", message, source: "desktop" },
        response: "Created index.html.",
        actionResults: [
          {
            success: true,
            userFacingText: "Created index.html.",
            verifiedUserFacing: true,
            data: {
              actionName: "WRITE_FILE",
              mutationKind: "local-file",
              mutation: {
                action: "WRITE_FILE",
                requestedPath: "index.html",
                resolvedPath: "/workspace/index.html",
                success: true,
                message: "Created index.html.",
              },
            },
          },
        ],
      }),
    );

    expect(result).toMatchObject({
      kind: "final",
      runFailureMessage: undefined,
      observedActionCount: 1,
      usedFallback: false,
    });
    expect(harness.finishEvents[0]?.status).toBe("complete");
  });
});
