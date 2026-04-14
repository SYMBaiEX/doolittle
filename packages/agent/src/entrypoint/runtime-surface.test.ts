import { describe, expect, it, mock } from "bun:test";
import { handleEntrypointRuntimeSurface } from "./runtime-surface";

function createContext() {
  return {
    config: {
      agentName: "Doolittle",
      mode: "cli",
      dataDir: "/tmp/doolittle-tests",
    },
    gateway: {
      start: mock(async () => {}),
    },
  } as const;
}

function createLogger() {
  return {
    info: mock(() => {}),
  };
}

describe("handleEntrypointRuntimeSurface", () => {
  it("starts the gateway command before returning", async () => {
    const context = createContext();
    const runtimeLogger = createLogger();
    const printLine = mock(() => {});

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
    const startCli = mock(async () => 7);

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
    });

    expect(result).toEqual({ handled: true, exitCode: 7 });
    expect(pushedArgs).toEqual(["--plain-cli"]);
    expect(startCli).toHaveBeenCalledTimes(1);
    expect(startCli).toHaveBeenCalledWith(context, {
      onReady: expect.any(Function),
      bootLogs: [{ source: "stdout", text: "booted" }],
    });
  });

  it("prints the no-surface message when runtime is initialized without cli or api", async () => {
    const context = createContext();
    const runtimeLogger = createLogger();
    const printLine = mock(() => {});

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
