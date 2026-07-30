import { describe, expect, it, vi } from "vitest";

vi.mock("@elizaos/agent/runtime/plugin-lifecycle", () => ({
  installRuntimePluginLifecycle: vi.fn(),
}));

import { initializeElizaRuntime } from "./initialization";

describe("initializeElizaRuntime", () => {
  it("installs the official plugin lifecycle before initialization and validates the runtime", async () => {
    const calls: string[] = [];
    const runtime = {
      initialize: vi.fn(async () => {
        calls.push("initialize");
      }),
    };
    const lifecycle = {
      installRuntimePluginLifecycle: vi.fn(() => {
        calls.push("plugin-lifecycle");
      }),
      shutdownRuntime: vi.fn().mockResolvedValue(undefined),
      validateRuntime: vi.fn(async () => {
        calls.push("validate");
      }),
    };

    await expect(
      initializeElizaRuntime(() => runtime as never, lifecycle),
    ).resolves.toBe(runtime);

    expect(calls).toEqual(["plugin-lifecycle", "initialize", "validate"]);
    expect(lifecycle.shutdownRuntime).not.toHaveBeenCalled();
  });

  it("preserves the SDK startup failure and delegates partial teardown", async () => {
    const failure = new Error("ELIZA_PGLITE_MANUAL_RESET_REQUIRED");
    const runtime = {
      initialize: vi.fn().mockRejectedValue(failure),
    };
    const lifecycle = {
      installRuntimePluginLifecycle: vi.fn(),
      shutdownRuntime: vi.fn().mockResolvedValue(undefined),
      validateRuntime: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      initializeElizaRuntime(() => runtime as never, lifecycle),
    ).rejects.toBe(failure);
    expect(lifecycle.installRuntimePluginLifecycle).toHaveBeenCalledWith(
      runtime,
    );
    expect(lifecycle.shutdownRuntime).toHaveBeenCalledWith(
      runtime,
      "Doolittle runtime initialization failure",
      { fast: true },
    );
  });
});
