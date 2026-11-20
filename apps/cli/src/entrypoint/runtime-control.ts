import type { AppLogger } from "@doolittle/agent/logging/logger";
import type { AppContext } from "@doolittle/agent/runtime/bootstrap";
import { readWorkerBotProfile } from "@doolittle/agent/runtime/bootstrap/bot-profile";
import type { ApiServerAddress } from "@doolittle/agent/server";
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

export interface EntrypointRuntimePlan {
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
  immediatePrompt?: string;
}): EntrypointRuntimePlan {
  const commandPlan = resolveEntrypointCommandPlan(options.command);
  const wantsApi = options.mode === "api" || options.mode === "both";
  const shouldStartCli =
    options.shellIsInteractive && commandPlan.shouldUseCliSurface;
  const isOneShot =
    Boolean(options.immediatePrompt?.trim()) &&
    (options.command === "exec" ||
      isEntrypointAliasCommand(options.command) ||
      !options.shellIsInteractive);
  const shouldStartApi =
    !isOneShot && (wantsApi || commandPlan.shouldUseApiSurface);
  const shouldStartApiImmediately =
    shouldStartApi && (commandPlan.shouldUseApiSurface || !shouldStartCli);

  return {
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
  startServer: () => Promise<boolean>;
  startServerWhenShellReady: () => void;
  apiOwnsRuntimeAfterCli: () => Promise<boolean>;
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

  let backgroundStartup: Promise<boolean> | undefined;
  let shellClosed = false;
  let listenerRequested = false;
  const startServer = async (fromCli = false): Promise<boolean> => {
    try {
      if (!hydrateAfterListening) {
        await context.ensureDeferredHydration("api");
      }
      if (fromCli && shellClosed) return false;
      const listen =
        startApiServer ??
        (await import("@doolittle/agent/server")).startApiServer;
      if (fromCli && shellClosed) return false;
      listenerRequested = true;
      const serverAddress = await listen(context);
      if (!readWorkerBotProfile()) {
        try {
          context.gateway.startIngress();
        } catch (error) {
          // The listener still owns the runtime if ingress cannot start.
          runtimeLogger.captureError("gateway-ingress-startup-failed", error);
        }
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
      return true;
    } catch (error) {
      const code =
        error instanceof Error && "code" in error ? String(error.code) : "";
      if (code === "EADDRINUSE" && command !== "api" && command !== "gateway") {
        runtimeLogger.warn("api-port-in-use", {
          port: context.config.port,
        });
        writeStderrLine(
          shouldStartCli
            ? `API port ${context.config.port} is already in use. Continuing with local CLI only.`
            : `API port ${context.config.port} is already in use.`,
        );
        return false;
      } else {
        throw error;
      }
    }
  };

  const startServerWhenShellReady = () => {
    if (backgroundStartup || shellClosed || !shouldStartCli) {
      return;
    }
    backgroundStartup = startServer(true).catch((error) => {
      if (shellClosed && !listenerRequested) return false;
      runtimeLogger.captureError("background-api-startup-failed", error, {
        port: context.config.port,
      });
      writeStderrLine(
        `Background API startup failed: ${formatTopLevelError(error)}`,
      );
      return false;
    });
  };

  const apiOwnsRuntimeAfterCli = async () => {
    shellClosed = true;
    // An API request still hydrating the runtime needs no listener after EOF.
    // Once binding has begun, wait for its result before transferring ownership.
    return listenerRequested && ((await backgroundStartup) ?? false);
  };

  return { startServer, startServerWhenShellReady, apiOwnsRuntimeAfterCli };
}
