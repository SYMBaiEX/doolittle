import {
  type IAgentRuntime,
  type IDatabaseAdapter,
  markTaskSchedulerDirty,
  registerTaskSchedulerRuntime,
  startTaskScheduler,
  stopTaskScheduler,
} from "@elizaos/core";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  stopTaskScheduler();
  vi.useRealTimers();
});

it("does not overlap an agent's task execution when another scheduler tick marks it dirty", async () => {
  vi.useFakeTimers();
  const agentId = "00000000-0000-4000-8000-000000000001";
  let finish: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const runTick = vi
    .fn()
    .mockReturnValueOnce(pending)
    .mockResolvedValue(undefined);
  const getTasks = vi.fn().mockResolvedValue([{ agentId }]);
  startTaskScheduler({ getTasks } as unknown as IDatabaseAdapter);
  registerTaskSchedulerRuntime({ agentId } as IAgentRuntime, { runTick });
  try {
    await vi.advanceTimersByTimeAsync(1000);
    expect(runTick).toHaveBeenCalledTimes(1);
    markTaskSchedulerDirty(agentId);
    await vi.advanceTimersByTimeAsync(3000);
    expect(runTick).toHaveBeenCalledTimes(1);
    finish?.();
    await vi.advanceTimersByTimeAsync(1000);
    expect(runTick).toHaveBeenCalledTimes(2);
  } finally {
    finish?.();
  }
});
