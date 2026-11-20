type RuntimeShutdownReason = "SIGINT" | "SIGTERM" | "disconnect";
type RuntimeFatalOrigin = "uncaughtException" | "unhandledRejection";

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
  label: string;
  signalHost?: RuntimeSignalHost;
  close: (reason: string) => Promise<void>;
  onExit?: (exitCode: number) => void;
  writeError?: (message: string) => void;
  captureFatal?: (error: Error, origin: RuntimeFatalOrigin) => void;
  /** Only IPC-owned desktop children must die with their host; standalone APIs remain alive. */
  watchHostDisconnect?: boolean;
}

/** Translate process signals into one close operation owned by the caller. */
export function installRuntimeProcessLifecycle({
  label,
  close,
  signalHost = process,
  onExit = (exitCode) => process.exit(exitCode),
  writeError = (message) => process.stderr.write(`${message}\n`),
  watchHostDisconnect = process.env.DOOLITTLE_DESKTOP_RUNTIME === "1" &&
    typeof process.send === "function",
  captureFatal = (error, origin) => {
    writeError(
      `[doolittle] runtime fatal (${origin}): ${error.stack || error.message}`,
    );
  },
}: RuntimeProcessLifecycleOptions) {
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
      const exitCode =
        signal === "SIGINT" ? 130 : signal === "disconnect" ? 1 : 0;
      shutdownPromise = Promise.resolve()
        .then(() =>
          close(
            `${label} received ${signal === "disconnect" ? "host IPC disconnect" : signal}`,
          ),
        )
        .then(
          () => onExit(exitCode),
          (error) => {
            const detail =
              error instanceof Error ? error.message : String(error);
            writeError(`[doolittle] ${label} shutdown failed: ${detail}`);
            onExit(1);
          },
        );
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

  return {
    dispose,
    get closing() {
      return shutdownPromise;
    },
  };
}
