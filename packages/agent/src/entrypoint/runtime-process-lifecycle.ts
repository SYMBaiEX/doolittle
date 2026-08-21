import type { AgentRuntime } from "@elizaos/core";
import { disposeRuntime } from "@/runtime/bootstrap/runtime/initialization";

export type RuntimeShutdownSignal = "SIGINT" | "SIGTERM";
export type RuntimeFatalOrigin = "uncaughtException" | "unhandledRejection";

type RuntimeFatalListener = (error: Error, origin: RuntimeFatalOrigin) => void;

export interface RuntimeSignalHost {
  once(signal: RuntimeShutdownSignal, listener: () => void): unknown;
  once(
    event: "uncaughtExceptionMonitor",
    listener: RuntimeFatalListener,
  ): unknown;
  removeListener(signal: RuntimeShutdownSignal, listener: () => void): unknown;
  removeListener(
    event: "uncaughtExceptionMonitor",
    listener: RuntimeFatalListener,
  ): unknown;
}

interface RuntimeProcessLifecycleOptions {
  runtime: AgentRuntime;
  label: string;
  signalHost?: RuntimeSignalHost;
  shutdownRuntime?: typeof disposeRuntime;
  onExit?: (exitCode: number) => void;
  writeError?: (message: string) => void;
  captureFatal?: (error: Error, origin: RuntimeFatalOrigin) => void;
}

export interface RuntimeProcessLifecycle {
  shutdown(signal: RuntimeShutdownSignal): Promise<void>;
  dispose(): void;
}

/**
 * Give long-lived API/gateway hosts one idempotent process boundary.
 *
 * Electron owns the child process and sends SIGTERM. Doolittle owns only the
 * signal-to-runtime handoff; Eliza owns service shutdown and database-adapter
 * closure through `shutdownRuntime`.
 */
export function installRuntimeProcessLifecycle({
  runtime,
  label,
  signalHost = process,
  shutdownRuntime = disposeRuntime,
  onExit = (exitCode) => process.exit(exitCode),
  writeError = (message) => process.stderr.write(`${message}\n`),
  captureFatal = (error, origin) => {
    writeError(
      `[doolittle] runtime fatal (${origin}): ${error.stack || error.message}`,
    );
  },
}: RuntimeProcessLifecycleOptions): RuntimeProcessLifecycle {
  let shutdownPromise: Promise<void> | undefined;

  const dispose = () => {
    signalHost.removeListener("SIGINT", handleSigint);
    signalHost.removeListener("SIGTERM", handleSigterm);
    signalHost.removeListener("uncaughtExceptionMonitor", handleFatal);
  };

  const shutdown = (signal: RuntimeShutdownSignal): Promise<void> => {
    if (!shutdownPromise) {
      dispose();
      const exitCode = signal === "SIGINT" ? 130 : 0;
      shutdownPromise = shutdownRuntime(
        runtime,
        `${label} received ${signal}`,
        undefined,
        { fast: true },
      )
        .catch((error) => {
          const detail = error instanceof Error ? error.message : String(error);
          writeError(`[doolittle] runtime shutdown failed: ${detail}`);
        })
        .then(() => {
          onExit(exitCode);
        });
    }
    return shutdownPromise;
  };

  const handleSigint = () => {
    void shutdown("SIGINT");
  };
  const handleSigterm = () => {
    void shutdown("SIGTERM");
  };
  const handleFatal: RuntimeFatalListener = (error, origin) => {
    try {
      captureFatal(error, origin);
    } catch (captureError) {
      const detail =
        captureError instanceof Error
          ? captureError.message
          : String(captureError);
      writeError(`[doolittle] runtime fatal diagnostic failed: ${detail}`);
    }
  };

  signalHost.once("SIGINT", handleSigint);
  signalHost.once("SIGTERM", handleSigterm);
  signalHost.once("uncaughtExceptionMonitor", handleFatal);

  return { shutdown, dispose };
}
