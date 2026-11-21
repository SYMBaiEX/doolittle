import { afterEach, expect, it, vi } from "vitest";
import { createDeferred } from "../support/deferred";

afterEach(() => {
  vi.doUnmock("@doolittle/agent/runtime/bootstrap");
  vi.doUnmock("@doolittle/agent/server");
  vi.doUnmock("../../apps/cli/src/cli/startup");
  vi.unstubAllEnvs();
  vi.resetModules();
});

it.each([false, true])(
  "begins activation before the API module is available (load failure: %s)",
  async (fails) => {
    const context = {
      config: { mode: "api" },
      services: { logger: { child: vi.fn() } },
    };
    const runtime = createDeferred<typeof context>();
    const api = createDeferred<{ startApiServer: () => void }>();
    const activate = vi.fn(() => runtime.promise);
    const dispose = vi.fn(async () => {
      runtime.resolve(context);
    });
    vi.stubEnv("DOOLITTLE_DESKTOP_RUNTIME", "1");
    vi.doMock("../../apps/cli/src/cli/startup", () => ({
      ensureOnboarded: vi.fn(),
      loadLocalRuntimeEnv: vi.fn(),
    }));
    vi.doMock("@doolittle/agent/runtime/bootstrap", () => ({
      getAppContext: activate,
      getApplicationSession: () => ({ dispose }),
    }));
    vi.doMock("@doolittle/agent/server", () => api.promise);
    const { prepareEntrypointRuntimeBoot } = await import(
      "../../apps/cli/src/entrypoint/runtime-boot"
    );

    const startup = prepareEntrypointRuntimeBoot({
      command: "api",
      shellIsInteractive: false,
    });
    const settled = vi.fn();
    void startup.then(settled, settled);
    try {
      await vi.waitFor(() => expect(activate).toHaveBeenCalledOnce());
      expect(activate).toHaveBeenCalledWith({
        startupMode: "api",
        eagerDeferredHydration: false,
      });
      expect(settled).not.toHaveBeenCalled();
      if (fails) {
        const error = new Error("API module unavailable");
        api.reject(error);
        await expect(startup).rejects.toMatchObject({ cause: error });
        expect(dispose).toHaveBeenCalledExactlyOnceWith(
          "Doolittle API could not load",
          { fast: true },
        );
      } else {
        api.resolve({ startApiServer: vi.fn() });
        runtime.resolve(context);
        await expect(startup).resolves.toMatchObject({ context });
        expect(dispose).not.toHaveBeenCalled();
      }
    } finally {
      api.resolve({ startApiServer: vi.fn() });
      runtime.resolve(context);
      await startup.catch(() => undefined);
    }
  },
);
