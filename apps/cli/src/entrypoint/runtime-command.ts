import { pathToFileURL } from "node:url";
import { isMainThread } from "node:worker_threads";
import type { AppLogger } from "@doolittle/agent/logging/logger";
import type { AgentRuntime } from "@elizaos/core";
import type { EntrypointInvocation } from "./invocation";
import { prepareEntrypointRuntimeBoot } from "./runtime-boot";
import { installRuntimeProcessLifecycle } from "./runtime-process-lifecycle";

export async function runEntrypointRuntime(
  invocation: EntrypointInvocation,
  entryLogger: AppLogger,
  entryUrl: string,
): Promise<number> {
  let sharedEngineHost: ReturnType<
    typeof import("@doolittle/agent/runtime/engine/host").installSharedEngineHost
  >;
  if (!isMainThread) {
    const { installEngineWorkerTransport } = await import(
      "@doolittle/agent/runtime/engine/worker-transport"
    );
    installEngineWorkerTransport();
  } else if (
    process.env.DOOLITTLE_DESKTOP_RUNTIME === "1" &&
    process.env.DOOLITTLE_SHARED_ENGINE === "1" &&
    typeof process.send === "function"
  ) {
    const { installSharedEngineHost } = await import(
      "@doolittle/agent/runtime/engine/host"
    );
    const workerEntry = process.env.DOOLITTLE_ENGINE_WORKER_ENTRY;
    sharedEngineHost = installSharedEngineHost(
      workerEntry ? pathToFileURL(workerEntry) : entryUrl,
    );
  }
  const { command, oneShot, jobControlDir } = invocation;
  const {
    context,
    bootLogs,
    runtimePlan,
    runtimeLogger,
    startServer,
    startServerWhenShellReady,
    apiOwnsRuntimeAfterCli,
  } = await prepareEntrypointRuntimeBoot(invocation);

  let closing: Promise<void> | undefined;
  const closeRuntime = (reason: string) =>
    (closing ??= (async () => {
      try {
        await sharedEngineHost?.stopAll();
      } finally {
        const { shutdownApplicationRuntime } = await import(
          "@doolittle/agent/runtime/application"
        );
        await shutdownApplicationRuntime(
          context.runtime as AgentRuntime,
          reason,
          { fast: true },
        );
      }
    })());
  const installApiLifecycle = () =>
    installRuntimeProcessLifecycle({
      label: `${context.config.agentName} ${command}`,
      close: closeRuntime,
      captureFatal: (error, origin) => {
        entryLogger.captureError("runtime-process-fatal", error, {
          command,
          origin,
        });
      },
    });

  if (runtimePlan.shouldStartApiImmediately) {
    const lifecycle = installApiLifecycle();
    let started: boolean;
    try {
      started = await startServer();
    } catch (error) {
      lifecycle.dispose();
      await closeRuntime("Doolittle API could not start").catch(
        (cleanupError: unknown) => {
          throw new AggregateError(
            [error, cleanupError],
            "Doolittle API startup and runtime cleanup failed",
          );
        },
      );
      throw error;
    }
    if (!started) {
      lifecycle.dispose();
      await closeRuntime("Doolittle API unavailable");
      return 1;
    }
    if (command === "api") return 0;
  }

  const { handleEntrypointRuntimeSurface } = await import("./runtime-surface");
  const runtimeSurface = await handleEntrypointRuntimeSurface({
    command,
    oneShot,
    jobControlDir,
    context,
    runtimePlan,
    runtimeLogger,
    startServerWhenShellReady,
    apiOwnsRuntimeAfterCli,
    bootLogs,
  });

  if (runtimeSurface.apiOwnsRuntime) installApiLifecycle();
  return runtimeSurface.exitCode;
}
