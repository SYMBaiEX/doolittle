import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock("../../packages/agent/src/config/env/schema");
  vi.doUnmock("../../apps/cli/src/entrypoint/runtime-boot");
  vi.doUnmock("@doolittle/agent/runtime/engine/host");
  vi.doUnmock("@doolittle/agent/runtime/engine/worker-transport");
  vi.doUnmock("@doolittle/agent/runtime/application");
  vi.resetModules();
});

it("loads the CLI environment without evaluating the runtime schema", async () => {
  vi.doMock("../../packages/agent/src/config/env/schema", () => {
    throw new Error(
      "The runtime schema should load during runtime activation.",
    );
  });
  vi.stubEnv("DOOLITTLE_BOT_RUNTIME", "worker");
  vi.stubEnv("PGLITE_DATA_DIR", undefined);
  vi.stubEnv("DATABASE_URL", "unapproved-test-postgres");
  vi.stubEnv("POSTGRES_URL", "unapproved-test-postgres");
  vi.stubEnv("LOG_LEVEL", "error");
  vi.stubEnv("DEFAULT_LOG_LEVEL", "error");
  const { loadLocalRuntimeEnv } = await import(
    "../../apps/cli/src/cli/startup"
  );
  loadLocalRuntimeEnv();
  expect(process.env.PGLITE_DATA_DIR).toMatch(/[/\\]pglite$/u);
  expect(process.env.DATABASE_URL).toBeUndefined();
  expect(process.env.POSTGRES_URL).toBeUndefined();
});

it.each([false, true])(
  "loads only the selected engine and closes the runtime on a bind failure (desktop: %s)",
  async (desktop) => {
    const sendDescriptor = Object.getOwnPropertyDescriptor(process, "send");
    Object.defineProperty(process, "send", {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubEnv("DOOLITTLE_DESKTOP_RUNTIME", desktop ? "1" : undefined);
    vi.stubEnv("DOOLITTLE_SHARED_ENGINE", "1");
    vi.stubEnv("DOOLITTLE_ENGINE_WORKER_ENTRY", undefined);
    const runtime = {};
    const bindError = Object.assign(new Error("API port unavailable"), {
      code: "EADDRINUSE",
    });
    const startServer = vi.fn(async () => {
      throw bindError;
    });
    const boot = vi.fn(async () => ({
      context: { config: { agentName: "Eliza" }, runtime },
      runtimePlan: { shouldStartApiImmediately: true },
      startServer,
    }));
    const stopAll = vi.fn();
    const installSharedEngineHost = vi.fn(() => ({ stopAll }));
    const loadHost = vi.fn(() => ({ installSharedEngineHost }));
    const shutdownApplicationRuntime = vi.fn();
    vi.doMock("@doolittle/agent/runtime/engine/host", loadHost);
    vi.doMock("@doolittle/agent/runtime/engine/worker-transport", () => {
      throw new Error(
        "A main-thread invocation should not load worker transport.",
      );
    });
    vi.doMock("@doolittle/agent/runtime/application", () => ({
      shutdownApplicationRuntime,
    }));
    vi.doMock("../../apps/cli/src/entrypoint/runtime-boot", () => ({
      prepareEntrypointRuntimeBoot: boot,
    }));
    const listenerCount = process.listenerCount("SIGTERM");
    try {
      const { runEntrypointRuntime } = await import(
        "../../apps/cli/src/entrypoint/runtime-command"
      );
      await expect(
        runEntrypointRuntime(
          { command: "api", rest: [], shellIsInteractive: false },
          {} as Parameters<typeof runEntrypointRuntime>[1],
          import.meta.url,
        ),
      ).rejects.toBe(bindError);
      expect(process.listenerCount("SIGTERM")).toBe(listenerCount);
      if (desktop) {
        expect(installSharedEngineHost).toHaveBeenCalledExactlyOnceWith(
          import.meta.url,
        );
        expect(installSharedEngineHost).toHaveBeenCalledBefore(boot);
        expect(stopAll).toHaveBeenCalledBefore(shutdownApplicationRuntime);
      } else {
        expect(loadHost).not.toHaveBeenCalled();
      }
      expect(shutdownApplicationRuntime).toHaveBeenCalledExactlyOnceWith(
        runtime,
        "Doolittle API could not start",
        { fast: true },
      );
    } finally {
      if (sendDescriptor)
        Object.defineProperty(process, "send", sendDescriptor);
      else Reflect.deleteProperty(process, "send");
    }
  },
);
