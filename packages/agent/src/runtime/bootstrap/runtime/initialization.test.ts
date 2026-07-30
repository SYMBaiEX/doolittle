import { describe, expect, it, vi } from "vitest";
import { initializeElizaRuntime } from "./initialization";

describe("initializeElizaRuntime", () => {
  it("preserves the SDK startup failure and disposes partial runtime state", async () => {
    const failure = new Error("ELIZA_PGLITE_MANUAL_RESET_REQUIRED");
    const runtime = {
      initialize: vi.fn().mockRejectedValue(failure),
      stop: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };

    await expect(initializeElizaRuntime(() => runtime as never)).rejects.toBe(
      failure,
    );
    expect(runtime.stop).toHaveBeenCalledOnce();
    expect(runtime.close).toHaveBeenCalledOnce();
  });
});
