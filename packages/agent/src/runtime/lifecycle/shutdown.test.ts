import { describe, expect, it, vi } from "vitest";
import { shutdownElizaRuntime } from "./shutdown";

describe("shutdownElizaRuntime", () => {
  it("stops services before closing the database adapter", async () => {
    const calls: string[] = [];
    const runtime = {
      stop: vi.fn(async () => {
        calls.push("stop");
      }),
      adapter: {
        close: vi.fn(async () => {
          calls.push("close");
        }),
      },
    };

    await shutdownElizaRuntime(runtime as never, "test shutdown", {
      fast: true,
    });

    expect(runtime.stop).toHaveBeenCalledWith({ fast: true });
    expect(calls).toEqual(["stop", "close"]);
  });

  it("still closes the adapter and preserves the first shutdown error", async () => {
    const stopError = new Error("stop failed");
    const runtime = {
      stop: vi.fn().mockRejectedValue(stopError),
      adapter: {
        close: vi.fn().mockRejectedValue(new Error("close failed")),
      },
    };

    await expect(
      shutdownElizaRuntime(runtime as never, "test shutdown"),
    ).rejects.toBe(stopError);
    expect(runtime.adapter.close).toHaveBeenCalledOnce();
  });
});
