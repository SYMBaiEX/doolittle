import { getCliErrorMessage } from "../cli/execution/types";
import { ensureOnboarded, loadLocalRuntimeEnv } from "../cli/startup";
import { captureBootLogs } from "./boot-logs";
import { writeStderrLine } from "./output";
import {
  createApiStartupController,
  resolveEntrypointCommandPlan,
  resolveEntrypointRuntimePlan,
} from "./runtime-control";
import type { EntrypointSubcommand } from "./subcommand";

export async function prepareEntrypointRuntimeBoot(options: {
  command: EntrypointSubcommand;
  shellIsInteractive: boolean;
  immediatePrompt?: string;
}) {
  const { command, shellIsInteractive } = options;
  const { startupMode, shouldUseCliSurface } =
    resolveEntrypointCommandPlan(command);
  const desktop = process.env.DOOLITTLE_DESKTOP_RUNTIME === "1";
  // The desktop shell owns first-run UX. Running the wizard in its API child
  // would block the health endpoint on interactive stdin.
  if (!desktop) await ensureOnboarded();
  loadLocalRuntimeEnv();

  if (shouldUseCliSurface) process.env.DOOLITTLE_MODE ??= "cli";
  const usesApi = startupMode === "api";
  const bootstrap = import("@doolittle/agent/runtime/bootstrap");
  // Let SDK activation begin as soon as the bootstrap module is available.
  // The API can load its routes while Eliza opens the profile's database.
  const activation = bootstrap.then(({ getAppContext }) =>
    captureBootLogs(
      command === "cockpit" ||
        ((command === "start" || command === "plain") && shellIsInteractive),
      () =>
        getAppContext({
          startupMode,
          // The API controller owns readiness of connectors before listen.
          eagerDeferredHydration: false,
        }),
    ),
  );
  const api = usesApi
    ? import("@doolittle/agent/server").catch(async (error: unknown) => {
        // Activation may already own a store. Let the application session
        // cancel and drain startup before reporting an API load failure.
        const runtime = await bootstrap.catch(() => undefined);
        try {
          await runtime
            ?.getApplicationSession()
            .dispose("Doolittle API could not load", { fast: true });
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            "Doolittle API load and runtime cleanup failed",
          );
        }
        throw error;
      })
    : undefined;
  const [loadedRuntime, loadedApi] = await Promise.allSettled([
    activation,
    api,
  ]);
  if (loadedApi.status === "rejected") throw loadedApi.reason;
  if (loadedRuntime.status === "rejected") throw loadedRuntime.reason;
  const { result: context, logs: bootLogs } = loadedRuntime.value;
  const runtimePlan = resolveEntrypointRuntimePlan({
    ...options,
    mode: context.config.mode,
  });
  const runtimeLogger = context.services.logger.child("entrypoint.index");
  const apiStartup = createApiStartupController({
    context,
    command,
    shouldStartCli: runtimePlan.shouldStartCli,
    runtimeLogger,
    startApiServer: loadedApi.value?.startApiServer,
    writeStderrLine,
    formatTopLevelError: getCliErrorMessage,
    hydrateAfterListening: desktop && usesApi,
  });
  return { context, bootLogs, runtimePlan, runtimeLogger, ...apiStartup };
}
