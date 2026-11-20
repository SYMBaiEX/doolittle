import { join } from "node:path";
import {
  NativeWorkspaceAdmission,
  runWithNativeWorkspaceAdmission,
} from "@doolittle/agent/runtime/execution-admission";
import { getCliErrorMessage } from "../cli/execution/types";
import { ensureOnboarded, loadLocalRuntimeEnv } from "../cli/startup";
import { captureBootLogs } from "./boot-logs";
import { prepareNativeProfile } from "./native-profile";
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
  const nativeService =
    (command === "api" || command === "gateway") &&
    process.env.DOOLITTLE_NATIVE_SERVICE === "1";
  const strictLoopbackToken = nativeService
    ? process.env.ELIZA_API_TOKEN
    : undefined;
  const requestedIngressPort =
    nativeService && command === "gateway"
      ? process.env.DOOLITTLE_CONNECTOR_INGRESS_PORT
      : undefined;
  delete process.env.DOOLITTLE_NATIVE_SERVICE;
  delete process.env.DOOLITTLE_CONNECTOR_INGRESS_PORT;
  let nativeProfile: ReturnType<typeof prepareNativeProfile> | undefined;
  if (nativeService) {
    if (
      process.env.ELIZA_API_BIND !== "127.0.0.1" ||
      !/^[!-~]{32,4096}$/u.test(strictLoopbackToken ?? "")
    ) {
      throw new Error("Native services require loopback authentication.");
    }
    nativeProfile = prepareNativeProfile(
      process.env.DOOLITTLE_WORKSPACE_DIR,
      process.env.DOOLITTLE_DATA_DIR,
    );
    const { workspace, dataDir } = nativeProfile;
    process.env.DOOLITTLE_WORKSPACE_DIR = workspace;
    process.env.DOOLITTLE_DATA_DIR = dataDir;
    process.env.PGLITE_DATA_DIR = join(dataDir, "pglite");
    process.env.DOOLITTLE_MODE = "api";
    process.env.ELIZA_API_TOKEN = "";
    process.env.ELIZA_REQUIRE_LOCAL_AUTH = "1";
  }
  // The desktop shell owns first-run UX. Running the wizard in its API child
  // would block the health endpoint on interactive stdin.
  if (!desktop && !nativeService) await ensureOnboarded();
  loadLocalRuntimeEnv();
  delete process.env.DOOLITTLE_CONNECTOR_INGRESS_PORT;
  if (nativeService) delete process.env.ELIZA_API_TOKEN;

  if (shouldUseCliSurface) process.env.DOOLITTLE_MODE ??= "cli";
  const usesApi = startupMode === "api";
  const [{ getAppContext }, server] = await Promise.all([
    import("@doolittle/agent/runtime/bootstrap"),
    usesApi ? import("@doolittle/agent/server") : undefined,
  ]);
  const ingressPort = server?.parseConnectorIngressPort(requestedIngressPort);
  const admission =
    nativeProfile &&
    new NativeWorkspaceAdmission(nativeProfile.workspaceIsCurrent);
  const inWorkspace = <T>(work: () => Promise<T>) =>
    admission ? runWithNativeWorkspaceAdmission(admission, work) : work();
  let connectorIngress:
    | import("@doolittle/agent/server").OwnedConnectorIngress
    | undefined;
  const { result: context, logs: bootLogs } = await inWorkspace(() =>
    captureBootLogs(
      command === "cockpit" ||
        ((command === "start" || command === "plain") && shellIsInteractive),
      () =>
        getAppContext({
          startupMode,
          eagerDeferredHydration: usesApi && !desktop,
        }),
    ),
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
    startApiServer:
      server && strictLoopbackToken
        ? async (context) => {
            const address = await server.startApiServer(context, {
              strictLoopbackToken,
            });
            if (ingressPort === undefined) return address;
            try {
              connectorIngress = await server.createConnectorIngressServer(
                context,
                {
                  port: ingressPort,
                  workspaceIsCurrent: () =>
                    !!nativeProfile &&
                    context.config.workspaceDir === nativeProfile.workspace &&
                    nativeProfile.workspaceIsCurrent(),
                },
              );
              console.log(
                `Connector ingress listening on ${connectorIngress.url}`,
              );
              return address;
            } catch (error) {
              await server.stopApiServer();
              throw error;
            }
          }
        : server?.startApiServer,
    writeStderrLine,
    formatTopLevelError: getCliErrorMessage,
    hydrateAfterListening: desktop && usesApi,
  });
  return {
    context,
    bootLogs,
    runtimePlan,
    runtimeLogger,
    closeConnectorIngress: () => connectorIngress?.close(),
    ...apiStartup,
    startServer: () => inWorkspace(apiStartup.startServer),
  };
}
