import { describe, expect, it, vi } from "vitest";
import { createDesktopQuitHandler } from "./desktop-quit";

describe("desktop owned-runtime quit boundary", () => {
  it("waits for every runtime and prevents repeated quit from bypassing cleanup", async () => {
    let finishWorker!: () => void;
    const workerExit = new Promise<void>((resolve) => {
      finishWorker = resolve;
    });
    const order: string[] = [];
    const releaseRuntimeStarts = vi.fn();
    const stop = vi.fn(async () => {
      await workerExit;
      order.push("runtime-exit");
    });
    const handler = createDesktopQuitHandler({
      holdRuntimeStarts: () => releaseRuntimeStarts,
      stopOwnedRuntimes: () => [stop],
      setQuitting: vi.fn(),
      afterStopped: async () => {
        order.push("dispose-ui");
      },
      quit: () => {
        order.push("quit");
      },
      onFailure: vi.fn(),
    });
    const first = { preventDefault: vi.fn() };
    const second = { preventDefault: vi.fn() };
    const pending = handler(first);
    expect(handler(second)).toBe(pending);
    await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce());
    expect(second.preventDefault).toHaveBeenCalledOnce();
    expect(order).toEqual([]);
    finishWorker();
    await pending;
    expect(order).toEqual(["runtime-exit", "dispose-ui", "quit"]);
    expect(releaseRuntimeStarts).not.toHaveBeenCalled();
    const finalQuit = { preventDefault: vi.fn() };
    await handler(finalQuit);
    expect(finalQuit.preventDefault).not.toHaveBeenCalled();
  });

  it("does not abandon pending stops after one fails, retains UI, and permits retry", async () => {
    let finishWorker!: () => void;
    const workerExit = new Promise<void>((resolve) => {
      finishWorker = resolve;
    });
    const leadStop = vi.fn().mockRejectedValueOnce(new Error("stop failed"));
    const workerStop = vi.fn(() => workerExit);
    const afterStopped = vi.fn(async () => {});
    const onFailure = vi.fn();
    const quit = vi.fn();
    const setQuitting = vi.fn();
    const releaseRuntimeStarts = vi.fn();
    const handler = createDesktopQuitHandler({
      holdRuntimeStarts: () => releaseRuntimeStarts,
      stopOwnedRuntimes: () => [leadStop, workerStop],
      afterStopped,
      onFailure,
      quit,
      setQuitting,
    });
    const pending = handler({ preventDefault: vi.fn() });
    await vi.waitFor(() => expect(workerStop).toHaveBeenCalledOnce());
    expect(onFailure).not.toHaveBeenCalled();
    expect(quit).not.toHaveBeenCalled();
    expect(releaseRuntimeStarts).not.toHaveBeenCalled();
    finishWorker();
    await pending;
    expect(onFailure).toHaveBeenCalledOnce();
    expect(releaseRuntimeStarts).toHaveBeenCalledOnce();
    expect(setQuitting).toHaveBeenLastCalledWith(false);
    expect(afterStopped).not.toHaveBeenCalled();
    expect(quit).not.toHaveBeenCalled();
    leadStop.mockResolvedValue(undefined);
    await handler({ preventDefault: vi.fn() });
    expect(afterStopped).toHaveBeenCalledOnce();
    expect(quit).toHaveBeenCalledOnce();
  });
});
