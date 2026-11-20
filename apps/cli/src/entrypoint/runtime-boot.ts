import { ensureOnboarded, loadLocalRuntimeEnv } from "../cli/startup";
import { captureBootLogs } from "./boot-logs";
import { writeStderrLine } from "./output";
import {
  createApiStartupController,
  resolveEntrypointCommandPlan,
  resolveEntrypointRuntimePlan,
} from "./runtime-control";
import { formatTopLevelError } from "./static-prompts";
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
  const [{ getAppContext }, server] = await Promise.all([
    import("@doolittle/agent/runtime/bootstrap"),
    usesApi ? import("@doolittle/agent/server") : undefined,
  ]);
  const { result: context, logs: bootLogs } = await captureBootLogs(
    command === "cockpit" ||
      ((command === "start" || command === "plain") && shellIsInteractive),
    () =>
      getAppContext({
        startupMode,
        eagerDeferredHydration: usesApi && !desktop,
      }),
  );
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
    startApiServer: server?.startApiServer,
    writeStderrLine,
    formatTopLevelError,
    hydrateAfterListening: desktop && usesApi,
  });
  return { context, bootLogs, runtimePlan, runtimeLogger, ...apiStartup };
}
