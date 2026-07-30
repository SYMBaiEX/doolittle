import { describe, expect, it, vi } from "vitest";
import type { AgentExecutionContext } from "@/runtime/chat";
import { runPostProviderTurn } from "./chat-turn/post-provider";

function createHarness(observedActionCount = 0) {
  const storedMessages: string[] = [];
  const finishEvents: Array<{ status: string; message?: string }> = [];
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
    },
    config: {},
  } as unknown as AgentExecutionContext;

  return { context, finishEvents, storedMessages };
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

  it("rejects a selected local file mutation without an SDK mutation receipt", async () => {
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

    expect(result.runFailureMessage).toContain(
      "did not produce a verified SDK action-result mutation receipt",
    );
    expect(harness.finishEvents[0]?.status).toBe("error");
  });

  it("does not infer execution requirements from user or provider prose", async () => {
    const harness = createHarness(2);
    const message = "create a website file in this project";

    const result = await runPostProviderTurn(
      createInput(harness.context, {
        input: { userId: "alice", message, source: "desktop" },
        effectiveInput: { userId: "alice", message, source: "desktop" },
        response: "🔎 Provider executed: []",
      }),
    );

    expect(result).toMatchObject({
      kind: "final",
      response: "🔎 Provider executed: []",
      runFailureMessage: undefined,
    });
    expect(harness.finishEvents[0]?.status).toBe("complete");
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
