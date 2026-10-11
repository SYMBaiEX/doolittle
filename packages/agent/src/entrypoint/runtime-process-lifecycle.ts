import type { AgentRuntime } from "@elizaos/core";
import { disposeRuntime } from "@/runtime/bootstrap/runtime/initialization";

export type RuntimeShutdownSignal = "SIGINT" | "SIGTERM";
export type RuntimeShutdownReason = RuntimeShutdownSignal | "disconnect";
export type RuntimeFatalOrigin = "uncaughtException" | "unhandledRejection";

type RuntimeFatalListener = (error: Error, origin: RuntimeFatalOrigin) => void;

export interface RuntimeSignalHost {
  connected?: boolean;
  once(signal: RuntimeShutdownReason, listener: () => void): unknown;
  once(
    event: "uncaughtExceptionMonitor",
    listener: RuntimeFatalListener,
  ): unknown;
  removeListener(signal: RuntimeShutdownReason, listener: () => void): unknown;
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
  beforeShutdown?: () => Promise<void>;
  /** Only IPC-owned desktop children must die with their host; standalone APIs remain alive. */
  watchHostDisconnect?: boolean;
}

export interface RuntimeProcessLifecycle {
  shutdown(signal: RuntimeShutdownReason): Promise<void>;
  dispose(): void;
}

/**
 * Give long-lived API/gateway hosts one idempotent process boundary.
 *
 * Electron owns the child process and sends SIGTERM. Loss of its IPC channel
 * also ends a desktop-owned runtime, including host loss during boot. Doolittle owns only the
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
  beforeShutdown,
  watchHostDisconnect = process.env.DOOLITTLE_DESKTOP_RUNTIME === "1" &&
    typeof process.send === "function",
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
    if (watchHostDisconnect) {
      signalHost.removeListener("disconnect", handleHostDisconnect);
    }
    signalHost.removeListener("uncaughtExceptionMonitor", handleFatal);
  };

  const shutdown = (signal: RuntimeShutdownReason): Promise<void> => {
    if (!shutdownPromise) {
      dispose();
      let exitCode =
        signal === "SIGINT" ? 130 : signal === "disconnect" ? 1 : 0;
      shutdownPromise = Promise.resolve()
        .then(async () => {
          try {
            await beforeShutdown?.();
          } finally {
            await shutdownRuntime(
              runtime,
              `${label} received ${signal === "disconnect" ? "host IPC disconnect" : signal}`,
              undefined,
              { fast: true },
            );
          }
        })
        .catch((error) => {
          if (beforeShutdown) exitCode = 1;
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
  const handleHostDisconnect = () => {
    void shutdown("disconnect");
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
  if (watchHostDisconnect) {
    signalHost.once("disconnect", handleHostDisconnect);
    // The parent can disappear before runtime bootstrap installs this boundary.
    // Do not wait for an already-delivered disconnect event in that case.
    if (signalHost.connected === false) handleHostDisconnect();
  }

  return { shutdown, dispose };
}
