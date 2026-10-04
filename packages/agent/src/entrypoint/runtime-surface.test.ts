import { describe, expect, it, vi } from "vitest";
import { resolveEntrypointRuntimePlan } from "./runtime-control";
import { handleEntrypointRuntimeSurface } from "./runtime-surface";

function createContext() {
  return {
    config: {
      agentName: "Doolittle",
      mode: "cli",
      dataDir: "/tmp/doolittle-tests",
    },
    gateway: {
      start: vi.fn(async () => {}),
    },
    runtime: {},
  } as const;
}

function createLogger() {
  return {
    info: vi.fn(() => {}),
  };
}

describe("handleEntrypointRuntimeSurface", () => {
  it.each([
    "missing-handler",
    "missing-result",
    "throw",
    "startup-failure",
    "cleanup-failure",
  ])("cleans up before exit or rejection for %s", async (failure) => {
    const context = createContext();
    const order: string[] = [];
    const close = vi.fn(async () => {
      order.push("close");
      if (failure === "cleanup-failure") throw new Error("cleanup failed");
    });
    const acquireTerminalEndpoint = vi.fn(async () => {
      order.push("acquire");
      if (failure === "startup-failure") throw new Error("startup failed");
      return {
        address: {
          host: "127.0.0.1",
          port: 12345,
          url: "http://127.0.0.1:12345",
        },
        close,
      };
    });
    const runCliPrompt = vi.fn(async () => {
      order.push("prompt");
      if (failure === "throw") throw new Error("runner failed");
      return undefined;
    });
    const shutdownRuntime = vi.fn(async () => {
      order.push("shutdown");
    });
    const exit = vi.fn(() => {
      order.push("exit");
    });
    const input = {
      command: "exec" as const,
      shellIsInteractive: false,
      immediatePrompt: "real prompt",
      oneShot: failure === "missing-handler" ? { jsonStream: true } : undefined,
      context: context as never,
      runtimePlan: resolveEntrypointRuntimePlan({
        command: "exec",
        shellIsInteractive: false,
        mode: "cli",
        stdinIsTTY: false,
      }),
      runtimeLogger: createLogger() as never,
      startServerWhenShellReady: () => {},
      bootLogs: [],
      acquireTerminalEndpoint,
      runCliPrompt,
      shutdownRuntime,
      exit,
    };
    if (["throw", "startup-failure", "cleanup-failure"].includes(failure)) {
      await expect(
        handleEntrypointRuntimeSurface(
          input as Parameters<typeof handleEntrypointRuntimeSurface>[0],
        ),
      ).rejects.toThrow();
      expect(exit).not.toHaveBeenCalled();
    } else {
      await expect(
        handleEntrypointRuntimeSurface(
          input as Parameters<typeof handleEntrypointRuntimeSurface>[0],
        ),
      ).resolves.toEqual({ handled: true });
      expect(exit).toHaveBeenCalledWith(1);
      expect(order.at(-1)).toBe("exit");
    }
    expect(shutdownRuntime).toHaveBeenCalledOnce();
    if (failure === "startup-failure") {
      expect(runCliPrompt).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
    } else {
      expect(close).toHaveBeenCalledOnce();
      expect(order.indexOf("close")).toBeLessThan(order.indexOf("shutdown"));
    }
  });
  it("shuts down the runtime after a one-shot status result", async () => {
    const context = createContext();
    const shutdownRuntime = vi.fn(async () => {});
    const exit = vi.fn(() => {});
    const closeEndpoint = vi.fn(async () => {});
    const acquireTerminalEndpoint = vi.fn(async () => ({
      address: {
        host: "127.0.0.1",
        port: 12345,
        url: "http://127.0.0.1:12345",
      },
      close: closeEndpoint,
    }));
    const runCliPrompt = vi.fn(async () => ({
      text: "status ok",
      tone: "success" as const,
    }));

    await expect(
      handleEntrypointRuntimeSurface({
        command: "status",
        shellIsInteractive: false,
        immediatePrompt: "/status",
        context: context as never,
        runtimePlan: {
          startupMode: "cli",
          eagerDeferredHydration: false,
          shouldUseCliSurface: true,
          shouldUseApiSurface: false,
          shouldUseCockpitSplash: false,
          shouldSetCliMode: true,
          wantsCli: true,
          wantsApi: false,
          shouldCaptureBootLogs: false,
          shouldStartCli: false,
          shouldStartApi: false,
          shouldStartApiImmediately: false,
        },
        runtimeLogger: createLogger() as never,
        runCliPrompt,
        acquireTerminalEndpoint,
        startServerWhenShellReady: () => {},
        bootLogs: [],
        shutdownRuntime,
        exit,
      }),
    ).resolves.toEqual({ handled: true });

    expect(runCliPrompt).toHaveBeenCalledOnce();
    expect(acquireTerminalEndpoint.mock.invocationCallOrder[0]).toBeLessThan(
      runCliPrompt.mock.invocationCallOrder[0] ?? 0,
    );
    expect(closeEndpoint.mock.invocationCallOrder[0]).toBeLessThan(
      shutdownRuntime.mock.invocationCallOrder[0] ?? 0,
    );
    expect(shutdownRuntime).toHaveBeenCalledWith(
      context.runtime,
      "Doolittle one-shot completion",
      { fast: true },
    );
    expect(exit).toHaveBeenCalledWith(0);
    expect(shutdownRuntime.mock.invocationCallOrder[0]).toBeLessThan(
      exit.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("starts the gateway command before returning", async () => {
    const context = createContext();
    const runtimeLogger = createLogger();
    const printLine = vi.fn(() => {});

    const result = await handleEntrypointRuntimeSurface({
      command: "gateway",
      shellIsInteractive: false,
      context: context as never,
      runtimePlan: {
        startupMode: "api",
        eagerDeferredHydration: true,
        shouldUseCliSurface: false,
        shouldUseApiSurface: true,
        shouldUseCockpitSplash: false,
        shouldSetCliMode: false,
        wantsCli: false,
        wantsApi: true,
        shouldCaptureBootLogs: false,
        shouldStartCli: false,
        shouldStartApi: true,
        shouldStartApiImmediately: true,
      },
      runtimeLogger: runtimeLogger as never,
      startServerWhenShellReady: () => {},
      bootLogs: [],
      printLine,
    });

    expect(result).toEqual({ handled: false });
    expect(context.gateway.start).toHaveBeenCalledTimes(1);
    expect(runtimeLogger.info).toHaveBeenCalledWith("gateway-started", {
      agentName: "Doolittle",
    });
    expect(printLine).toHaveBeenCalledWith("Doolittle gateway started.");
  });

  it("starts the cli surface and injects the plain flag", async () => {
    const context = createContext();
    const runtimeLogger = createLogger();
    const pushedArgs: string[] = [];
    const startCli = vi.fn(async () => 7);
    const shutdownRuntime = vi.fn(async () => {});
    const exit = vi.fn();

    const result = await handleEntrypointRuntimeSurface({
      command: "plain",
      shellIsInteractive: true,
      context: context as never,
      runtimePlan: {
        startupMode: "cli",
        eagerDeferredHydration: false,
        shouldUseCliSurface: true,
        shouldUseApiSurface: false,
        shouldUseCockpitSplash: false,
        shouldSetCliMode: true,
        wantsCli: true,
        wantsApi: false,
        shouldCaptureBootLogs: false,
        shouldStartCli: true,
        shouldStartApi: false,
        shouldStartApiImmediately: false,
      },
      runtimeLogger: runtimeLogger as never,
      startCli,
      startServerWhenShellReady: () => {},
      bootLogs: [{ source: "stdout", text: "booted" }],
      pushArg: (arg) => pushedArgs.push(arg),
      shutdownRuntime,
      exit,
    });

    expect(result).toEqual({ handled: true, exitCode: 7 });
    expect(pushedArgs).toEqual(["--plain-cli"]);
    expect(startCli).toHaveBeenCalledTimes(1);
    expect(startCli).toHaveBeenCalledWith(context, {
      onReady: expect.any(Function),
      bootLogs: [{ source: "stdout", text: "booted" }],
    });
    expect(shutdownRuntime).toHaveBeenCalledWith(
      context.runtime,
      "Doolittle CLI completion",
      { fast: true },
    );
    expect(exit).toHaveBeenCalledWith(7);
    expect(shutdownRuntime.mock.invocationCallOrder[0]).toBeLessThan(
      exit.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("prints the no-surface message when runtime is initialized without cli or api", async () => {
    const context = createContext();
    const runtimeLogger = createLogger();
    const printLine = vi.fn(() => {});

    const result = await handleEntrypointRuntimeSurface({
      command: "start",
      shellIsInteractive: false,
      context: context as never,
      runtimePlan: {
        startupMode: "cli",
        eagerDeferredHydration: false,
        shouldUseCliSurface: true,
        shouldUseApiSurface: false,
        shouldUseCockpitSplash: false,
        shouldSetCliMode: true,
        wantsCli: false,
        wantsApi: false,
        shouldCaptureBootLogs: false,
        shouldStartCli: false,
        shouldStartApi: false,
        shouldStartApiImmediately: false,
      },
      runtimeLogger: runtimeLogger as never,
      startServerWhenShellReady: () => {},
      bootLogs: [],
      printLine,
    });

    expect(result).toEqual({ handled: true });
    expect(runtimeLogger.info).toHaveBeenCalledWith(
      "runtime-initialized-no-surface",
      {
        mode: "cli",
      },
    );
    expect(printLine).toHaveBeenCalledWith(
      'Doolittle initialized with no active shell or API surface. Start with "doolittle", "doolittle cockpit", or "doolittle status", or set DOOLITTLE_MODE=cli|api|both for a persistent default.',
    );
  });
});
