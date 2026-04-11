import { ensureOnboarded, loadLocalRuntimeEnv } from "@/cli/startup";
import { captureBootLogs } from "@/entrypoint/boot-logs";
import type { AppLogger } from "@/logging/logger";
import type { AppContext } from "@/runtime/bootstrap";
import {
  createApiStartupController,
  type EntrypointCommandPlan,
  type EntrypointRuntimePlan,
  resolveEntrypointRuntimePlan,
} from "./runtime-control";
import type { EntrypointSubcommand } from "./subcommand";

type BootstrapModule = typeof import("@/runtime/bootstrap");
type CliModule = typeof import("@/cli");
type ServerModule = typeof import("@/server");

export interface PreparedEntrypointRuntimeBoot {
  context: AppContext;
  bootLogs: Awaited<ReturnType<typeof captureBootLogs>>["logs"];
  runtimePlan: EntrypointRuntimePlan;
  runtimeLogger: AppLogger;
  startCli: CliModule["startCli"] | undefined;
  runCliPrompt: CliModule["runCliPrompt"] | undefined;
  runCliPromptWithEvents: CliModule["runCliPromptWithEvents"] | undefined;
  startApiServer: ServerModule["startApiServer"] | undefined;
  startServer: () => Promise<void>;
  startServerWhenShellReady: () => void;
}

export interface EntrypointRuntimeBootOptions {
  command: EntrypointSubcommand;
  commandPlan: EntrypointCommandPlan;
  shellIsInteractive: boolean;
  stdinIsTTY: boolean;
  writeStderrLine: (message: string) => void;
  formatTopLevelError: (error: unknown) => string;
}

interface EntrypointRuntimeBootDeps {
  ensureOnboarded?: typeof ensureOnboarded;
  loadLocalRuntimeEnv?: typeof loadLocalRuntimeEnv;
  importBootstrap?: () => Promise<Pick<BootstrapModule, "getAppContext">>;
  importCli?: () => Promise<
    Pick<CliModule, "startCli" | "runCliPrompt" | "runCliPromptWithEvents">
  >;
  importServer?: () => Promise<Pick<ServerModule, "startApiServer">>;
  captureBootLogs?: typeof captureBootLogs;
  resolveEntrypointRuntimePlan?: typeof resolveEntrypointRuntimePlan;
  createApiStartupController?: typeof createApiStartupController;
}

export async function prepareEntrypointRuntimeBoot(
  options: EntrypointRuntimeBootOptions,
  deps: EntrypointRuntimeBootDeps = {},
): Promise<PreparedEntrypointRuntimeBoot> {
  const ensureReady = deps.ensureOnboarded ?? ensureOnboarded;
  const loadRuntimeEnv = deps.loadLocalRuntimeEnv ?? loadLocalRuntimeEnv;
  const importBootstrap =
    deps.importBootstrap ?? (async () => import("@/runtime/bootstrap"));
  const importCli = deps.importCli ?? (async () => import("@/cli"));
  const importServer = deps.importServer ?? (async () => import("@/server"));
  const captureLogs = deps.captureBootLogs ?? captureBootLogs;
  const resolveRuntimePlan =
    deps.resolveEntrypointRuntimePlan ?? resolveEntrypointRuntimePlan;
  const createStartupController =
    deps.createApiStartupController ?? createApiStartupController;

  await ensureReady();
  loadRuntimeEnv();

  const bootstrapModulePromise = importBootstrap();
  const cliModulePromise = options.commandPlan.shouldUseCliSurface
    ? importCli()
    : undefined;
  const serverModulePromise = options.commandPlan.shouldUseApiSurface
    ? importServer()
    : undefined;

  const [{ getAppContext }, cliModule, serverModule] = await Promise.all([
    bootstrapModulePromise,
    cliModulePromise,
    serverModulePromise,
  ]);

  if (options.commandPlan.shouldSetCliMode) {
    process.env.DOOLITTLE_MODE ??= "cli";
  }

  const { result: context, logs: bootLogs } = await captureLogs(
    options.commandPlan.shouldUseCockpitSplash ||
      ((options.command === "start" || options.command === "plain") &&
        options.shellIsInteractive),
    async () =>
      getAppContext({
        startupMode: options.commandPlan.startupMode,
        eagerDeferredHydration: options.commandPlan.eagerDeferredHydration,
      }),
  );
  const runtimePlan = resolveRuntimePlan({
    command: options.command,
    shellIsInteractive: options.shellIsInteractive,
    mode: context.config.mode,
    stdinIsTTY: options.stdinIsTTY,
  });
  const runtimeLogger = context.services.logger.child("entrypoint.index");
  const { startServer, startServerWhenShellReady } = createStartupController({
    context,
    command: options.command,
    shouldStartCli: runtimePlan.shouldStartCli,
    runtimeLogger,
    startApiServer: serverModule?.startApiServer,
    writeStderrLine: options.writeStderrLine,
    formatTopLevelError: options.formatTopLevelError,
  });

  return {
    context,
    bootLogs,
    runtimePlan,
    runtimeLogger,
    startCli: cliModule?.startCli,
    runCliPrompt: cliModule?.runCliPrompt,
    runCliPromptWithEvents: cliModule?.runCliPromptWithEvents,
    startApiServer: serverModule?.startApiServer,
    startServer,
    startServerWhenShellReady,
  };
}
