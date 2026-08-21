import type { AppLogger } from "@/logging/logger";
import type { AppContext } from "@/runtime/bootstrap";
import type { ApiServerAddress } from "@/server";
import {
  type EntrypointSubcommand,
  isEntrypointAliasCommand,
} from "./subcommand";

export type ApiStartupContext = AppContext;

// BackendManager polls health every 250ms. Reserve two poll windows so the
// desktop can observe a live listener before optional plugin registration does
// synchronous work; guarded turns still trigger hydration immediately.
export const DESKTOP_DEFERRED_HYDRATION_DELAY_MS = 500;

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
    command === "exec" ||
    isEntrypointAliasCommand(command);
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
  startApiServer?: (
    context: ApiStartupContext,
  ) => ApiServerAddress | undefined | Promise<ApiServerAddress | undefined>;
  writeStderrLine: (message: string) => void;
  formatTopLevelError: (error: unknown) => string;
  hydrateAfterListening?: boolean;
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
    hydrateAfterListening = false,
  } = options;

  let backgroundServerStarted = false;
  const startServer = async () => {
    try {
      if (!hydrateAfterListening) {
        await context.ensureDeferredHydration("api");
      }
      context.gateway.startIngress();
      let serverAddress: ApiServerAddress | undefined;
      if (!startApiServer) {
        const server = await import("@/server");
        serverAddress = await server.startApiServer(context);
      } else {
        serverAddress = await startApiServer(context);
      }
      const host = serverAddress?.host ?? context.config.host;
      const port = serverAddress?.port ?? context.config.port;
      const url = serverAddress?.url ?? `http://${host}:${port}`;
      runtimeLogger.info("api-server-started", {
        host,
        port,
        command,
      });
      if (!shouldStartCli || command === "api" || command === "gateway") {
        console.log(`${context.config.agentName} API listening on ${url}`);
      }
      if (hydrateAfterListening) {
        // Give the desktop's first health request an actual I/O turn before
        // optional plugin registration begins. Some Eliza plugin starts do
        // synchronous work before yielding even though their API is async.
        // Turns still join this same hydration promise at their route guard.
        const hydrationTimer = setTimeout(() => {
          void context.ensureDeferredHydration("desktop-api").catch((error) => {
            runtimeLogger.captureError(
              "background-deferred-hydration-failed",
              error,
              { command },
            );
          });
        }, DESKTOP_DEFERRED_HYDRATION_DELAY_MS);
        hydrationTimer.unref();
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
