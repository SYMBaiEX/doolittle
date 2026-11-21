import type { AppLogger } from "@doolittle/agent/logging/logger";
import type { AppContext } from "@doolittle/agent/runtime/bootstrap";
import { readWorkerBotProfile } from "@doolittle/agent/runtime/bootstrap/bot-profile";
import type { ApiServerAddress } from "@doolittle/agent/server";
import {
  DESKTOP_RUNTIME_LISTENING,
  DESKTOP_RUNTIME_READY_ACK,
} from "@doolittle/contracts/engine";
import {
  type EntrypointSubcommand,
  isEntrypointAliasCommand,
} from "./subcommand";

const DESKTOP_HYDRATION_FALLBACK_MS = 500;

function scheduleDesktopHydration(hydrate: () => void): void {
  const resume = () => {
    clearTimeout(fallback);
    process.off("message", onMessage);
    setImmediate(hydrate).unref();
  };
  const onMessage = (message: unknown) => {
    if (message === DESKTOP_RUNTIME_READY_ACK) resume();
  };
  // Standalone runtimes and a disconnected host still complete hydration.
  const fallback = setTimeout(resume, DESKTOP_HYDRATION_FALLBACK_MS);
  fallback.unref();
  process.on("message", onMessage);
}

export interface EntrypointCommandPlan {
  startupMode: "api" | "cli";
  shouldUseCliSurface: boolean;
}

export interface EntrypointRuntimePlan {
  shouldStartCli: boolean;
  shouldStartApi: boolean;
  shouldStartApiImmediately: boolean;
  oneShotPrompt?: string;
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
    shouldUseCliSurface,
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
  const oneShotPrompt =
    options.command === "exec" ||
    isEntrypointAliasCommand(options.command) ||
    !options.shellIsInteractive
      ? options.immediatePrompt?.trim() || undefined
      : undefined;
  const shouldStartCli =
    !oneShotPrompt &&
    options.shellIsInteractive &&
    commandPlan.shouldUseCliSurface;
  const shouldStartApi =
    !oneShotPrompt && (wantsApi || commandPlan.startupMode === "api");
  const shouldStartApiImmediately = shouldStartApi && !shouldStartCli;

  return {
    shouldStartCli,
    shouldStartApi,
    shouldStartApiImmediately,
    oneShotPrompt,
  };
}

interface ApiStartupControllerOptions {
  context: AppContext;
  command: EntrypointSubcommand;
  shouldStartCli: boolean;
  runtimeLogger: AppLogger;
  startApiServer?: (
    context: AppContext,
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
  const startIngress = () => {
    if (readWorkerBotProfile()) return;
    try {
      context.gateway.startIngress();
    } catch (error) {
      // The listener still owns the runtime if ingress cannot start.
      runtimeLogger.captureError("gateway-ingress-startup-failed", error);
    }
  };
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
      const host = serverAddress?.host ?? context.config.host;
      const port = serverAddress?.port ?? context.config.port;
      const url = serverAddress?.url ?? `http://${host}:${port}`;
      if (hydrateAfterListening) {
        // The host acknowledges after health and identity checks. Register
        // before publishing the address so we cannot miss the acknowledgement.
        scheduleDesktopHydration(() => {
          startIngress();
          void context.ensureDeferredHydration("desktop-api").catch((error) => {
            runtimeLogger.captureError(
              "background-deferred-hydration-failed",
              error,
              { command },
            );
          });
        });
        if (process.connected) {
          try {
            process.send?.({ type: DESKTOP_RUNTIME_LISTENING, url }, () => {});
          } catch {
            // stdout is still available when IPC closes during publication.
          }
        }
      } else {
        startIngress();
      }
      if (!shouldStartCli || command === "api" || command === "gateway") {
        console.log(`${context.config.agentName} API listening on ${url}`);
      }
      runtimeLogger.info("api-server-started", { host, port, command });
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
