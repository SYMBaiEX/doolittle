import type { AppLogger } from "@/logging/logger";
import type { AppContext } from "@/runtime/bootstrap";
import type { EntrypointSubcommand } from "./subcommand";

export type ApiStartupContext = AppContext;

export interface EntrypointCommandPlan {
  startupMode: "api" | "cli";
  eagerDeferredHydration: boolean;
  shouldUseCliSurface: boolean;
  shouldUseApiSurface: boolean;
  shouldUseCockpitSplash: boolean;
  shouldSetCliMode: boolean;
}

export interface EntrypointRuntimePlan extends EntrypointCommandPlan {
  wantsCli: boolean;
  wantsApi: boolean;
  shouldCaptureBootLogs: boolean;
  shouldStartCli: boolean;
  shouldStartApi: boolean;
  shouldStartApiImmediately: boolean;
}

export function resolveEntrypointCommandPlan(
  command: EntrypointSubcommand,
): EntrypointCommandPlan {
  const shouldUseCliSurface =
    command === "start" ||
    command === "cockpit" ||
    command === "dev" ||
    command === "plain" ||
    command === "exec";
  const shouldUseApiSurface = command === "api" || command === "gateway";

  return {
    startupMode: shouldUseApiSurface ? "api" : "cli",
    eagerDeferredHydration: shouldUseApiSurface,
    shouldUseCliSurface,
    shouldUseApiSurface,
    shouldUseCockpitSplash: command === "cockpit",
    shouldSetCliMode: shouldUseCliSurface,
  };
}

export function resolveEntrypointRuntimePlan(options: {
  command: EntrypointSubcommand;
  shellIsInteractive: boolean;
  mode: "cli" | "api" | "both";
  stdinIsTTY: boolean;
}): EntrypointRuntimePlan {
  const commandPlan = resolveEntrypointCommandPlan(options.command);
  const wantsCli = options.mode === "cli" || options.mode === "both";
  const wantsApi = options.mode === "api" || options.mode === "both";
  const shouldStartCli =
    options.shellIsInteractive &&
    (commandPlan.shouldUseCliSurface || (wantsCli && options.stdinIsTTY));
  const shouldStartApi = wantsApi || commandPlan.shouldUseApiSurface;
  const shouldStartApiImmediately =
    shouldStartApi && (commandPlan.shouldUseApiSurface || !shouldStartCli);

  return {
    ...commandPlan,
    wantsCli,
    wantsApi,
    shouldCaptureBootLogs:
      commandPlan.shouldUseCockpitSplash ||
      ((options.command === "start" || options.command === "plain") &&
        options.shellIsInteractive),
    shouldStartCli,
    shouldStartApi,
    shouldStartApiImmediately,
  };
}

interface ApiStartupControllerOptions {
  context: ApiStartupContext;
  command: EntrypointSubcommand;
  shouldStartCli: boolean;
  runtimeLogger: AppLogger;
  startApiServer?: (context: ApiStartupContext) => void;
  writeStderrLine: (message: string) => void;
  formatTopLevelError: (error: unknown) => string;
}

export function createApiStartupController(
  options: ApiStartupControllerOptions,
): {
  startServer: () => Promise<void>;
  startServerWhenShellReady: () => void;
} {
  const {
    context,
    command,
    runtimeLogger,
    shouldStartCli,
    startApiServer,
    writeStderrLine,
    formatTopLevelError,
  } = options;

  let backgroundServerStarted = false;
  const startServer = async () => {
    try {
      await context.ensureDeferredHydration("api");
      if (!startApiServer) {
        const server = await import("@/server");
        server.startApiServer(context);
      } else {
        startApiServer(context);
      }
      runtimeLogger.info("api-server-started", {
        host: context.config.host,
        port: context.config.port,
        command,
      });
      if (!shouldStartCli || command === "api" || command === "gateway") {
        console.log(
          `${context.config.agentName} API listening on http://${context.config.host}:${context.config.port}`,
        );
      }
    } catch (error) {
      const code =
        error instanceof Error && "code" in error ? String(error.code) : "";
      if (code === "EADDRINUSE" && command !== "api" && command !== "gateway") {
        runtimeLogger.warn("api-port-in-use", {
          port: context.config.port,
        });
        writeStderrLine(
          `API port ${context.config.port} is already in use. Continuing with local CLI only.`,
        );
      } else {
        throw error;
      }
    }
  };

  const startServerWhenShellReady = () => {
    if (backgroundServerStarted || !shouldStartCli) {
      return;
    }
    backgroundServerStarted = true;
    void startServer().catch((error) => {
      runtimeLogger.captureError("background-api-startup-failed", error, {
        port: context.config.port,
      });
      writeStderrLine(
        `Background API startup failed: ${formatTopLevelError(error)}`,
      );
    });
  };

  return { startServer, startServerWhenShellReady };
}
