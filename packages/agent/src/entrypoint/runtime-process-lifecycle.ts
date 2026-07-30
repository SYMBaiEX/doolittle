import type { AgentRuntime } from "@elizaos/core";
import { disposeRuntime } from "@/runtime/bootstrap/runtime/initialization";

export type RuntimeShutdownSignal = "SIGINT" | "SIGTERM";

export interface RuntimeSignalHost {
  once(signal: RuntimeShutdownSignal, listener: () => void): unknown;
  removeListener(signal: RuntimeShutdownSignal, listener: () => void): unknown;
}

interface RuntimeProcessLifecycleOptions {
  runtime: AgentRuntime;
  label: string;
  signalHost?: RuntimeSignalHost;
  shutdownRuntime?: typeof disposeRuntime;
  onExit?: (exitCode: number) => void;
  writeError?: (message: string) => void;
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
}: RuntimeProcessLifecycleOptions): RuntimeProcessLifecycle {
  let shutdownPromise: Promise<void> | undefined;

  const dispose = () => {
    signalHost.removeListener("SIGINT", handleSigint);
    signalHost.removeListener("SIGTERM", handleSigterm);
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

  signalHost.once("SIGINT", handleSigint);
  signalHost.once("SIGTERM", handleSigterm);

  return { shutdown, dispose };
}
