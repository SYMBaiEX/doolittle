import { expect, it, vi } from "vitest";
import type { AgentExecutionContext } from "../../packages/agent/src/runtime/chat";
import { runPostCommandTurn } from "../../packages/agent/src/runtime/chat-turn/post-command";
import type { PreparedTurnState } from "../../packages/agent/src/runtime/chat-turn/state";

it.each([
  { active: true, aborted: false, status: "error" },
  { active: true, aborted: true, status: "cancelled" },
  { active: false, aborted: false, status: undefined },
])(
  "settles the active turn after an asynchronous native failure ($status)",
  async ({ active, aborted, status }) => {
    const finishTurn = vi.fn();
    const context = {
      runtime: {},
      services: { runController: { getActive: () => active, finishTurn } },
    } as unknown as AgentExecutionContext;
    const input = {
      sessionId: "fixture-session",
      userId: "fixture-user",
      message: "Read the project.",
    };
    const prepared = {
      turn: { sessionId: input.sessionId, localInteractive: false },
    } as PreparedTurnState;
    const failure = new Error("Native provider unavailable");
    const runner = {
      prepareNativeTurnSetup: vi.fn().mockResolvedValue({ settingsBefore: {} }),
      runNativeMessageTurn: vi.fn().mockRejectedValue(failure),
    };

    await expect(
      runPostCommandTurn(
        input,
        input,
        context,
        { abortSignal: aborted ? AbortSignal.abort() : undefined },
        { mark: vi.fn(), flush: vi.fn() },
        runner,
        prepared,
      ),
    ).rejects.toBe(failure);
    expect(runner.runNativeMessageTurn).toHaveBeenCalledOnce();
    if (status) {
      expect(finishTurn).toHaveBeenCalledExactlyOnceWith(
        input.sessionId,
        status,
        aborted ? undefined : failure.message,
      );
    } else {
      expect(finishTurn).not.toHaveBeenCalled();
    }
  },
);
