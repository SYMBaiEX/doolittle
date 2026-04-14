import { afterEach, describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import { prepareEntrypointRuntimeBoot } from "./runtime-boot";

const originalMode = process.env.DOOLITTLE_MODE;

afterEach(() => {
  if (originalMode === undefined) {
    delete process.env.DOOLITTLE_MODE;
  } else {
    process.env.DOOLITTLE_MODE = originalMode;
  }
});

describe("prepareEntrypointRuntimeBoot", () => {
  it("boots the runtime and returns the runtime controller wiring", async () => {
    delete process.env.DOOLITTLE_MODE;
    const ensureOnboardedCalls: string[] = [];
    const loadLocalRuntimeEnvCalls: string[] = [];
    const ensureDeferredHydrationCalls: string[] = [];
    const startApiServerCalls: string[] = [];
    const childLogger = {
      info() {},
      warn() {},
      error() {},
      debug() {},
      captureError() {},
      child() {
        return childLogger;
      },
    };
    const context = {
      config: {
        mode: "both",
        host: "127.0.0.1",
        port: 3131,
      },
      services: {
        logger: childLogger,
      },
      ensureDeferredHydration: async (reason?: string) => {
        ensureDeferredHydrationCalls.push(reason ?? "unset");
      },
      runtime: {} as never,
      gateway: {} as never,
    } as unknown as AppContext;

    const boot = await prepareEntrypointRuntimeBoot(
      {
        command: "start",
        commandPlan: {
          startupMode: "cli",
          eagerDeferredHydration: false,
          shouldUseCliSurface: true,
          shouldUseApiSurface: true,
          shouldUseCockpitSplash: false,
          shouldSetCliMode: true,
        },
        shellIsInteractive: true,
        stdinIsTTY: true,
        writeStderrLine() {},
        formatTopLevelError: (error) => String(error),
      },
      {
        ensureOnboarded: async () => {
          ensureOnboardedCalls.push("called");
        },
        loadLocalRuntimeEnv: () => {
          loadLocalRuntimeEnvCalls.push("called");
        },
        importBootstrap: async () => ({
          getAppContext: async () => context,
        }),
        importCli: async () =>
          ({
            startCli: async () => 0,
            runCliPrompt: async () => undefined,
            runCliPromptWithEvents: async () => undefined,
          }) as never,
        importServer: async () => ({
          startApiServer: () => {
            startApiServerCalls.push("started");
          },
        }),
      },
    );

    expect(ensureOnboardedCalls).toEqual(["called"]);
    expect(loadLocalRuntimeEnvCalls).toEqual(["called"]);
    expect(process.env.DOOLITTLE_MODE ?? "").toBe("cli");
    expect(boot.context.config.mode).toBe("both");
    expect(boot.bootLogs).toEqual([]);
    expect(boot.runtimePlan.shouldStartCli).toBe(true);
    expect(boot.runtimePlan.shouldStartApi).toBe(true);
    expect(boot.runtimePlan.shouldStartApiImmediately).toBe(false);

    await boot.startServer();

    expect(ensureDeferredHydrationCalls).toEqual(["api"]);
    expect(startApiServerCalls).toEqual(["started"]);
  });
});
