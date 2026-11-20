import { join } from "node:path";
import {
  NativeWorkspaceAdmission,
  runWithNativeWorkspaceAdmission,
} from "@doolittle/agent/runtime/execution-admission";
import { createNativeBotHost } from "@doolittle/desktop/named-bot-host";
import { loadLocalRuntimeEnv } from "../cli/startup";
import { prepareNativeProfile } from "./native-profile";
import { installRuntimeProcessLifecycle } from "./runtime-process-lifecycle";

/** The native launcher owns a private child and its lifetime pipe. */
export async function runNativeApi(): Promise<void> {
  const bearerToken = process.env.ELIZA_API_TOKEN;
  const allowWorkspaceSave =
    process.env.DOOLITTLE_NATIVE_WORKSPACE_SAVE === "1";
  const controlPlane = process.env.DOOLITTLE_NATIVE_CONTROL_PLANE === "1";
  delete process.env.DOOLITTLE_NATIVE_WORKSPACE_SAVE;
  delete process.env.DOOLITTLE_NATIVE_CONTROL_PLANE;
  if (!bearerToken || !/^[a-f0-9]{64}$/u.test(bearerToken)) {
    throw new Error("Native API requires a 32-byte bearer capability.");
  }
  if (process.stdin.isTTY) {
    throw new Error("Native API requires an owned stdin lifetime pipe.");
  }
  const profile = prepareNativeProfile(
    process.env.DOOLITTLE_WORKSPACE_DIR,
    process.env.DOOLITTLE_DATA_DIR,
  );

  return runWithNativeWorkspaceAdmission(
    new NativeWorkspaceAdmission(profile.workspaceIsCurrent),
    () =>
      runOwnedNativeApi(profile, bearerToken, {
        allowWorkspaceSave,
        controlPlane,
      }),
  );
}

async function runOwnedNativeApi(
  profile: ReturnType<typeof prepareNativeProfile>,
  bearerToken: string,
  capabilities: { allowWorkspaceSave: boolean; controlPlane: boolean },
): Promise<void> {
  // The capability belongs to this listener only. Never forward it to agent tools.
  process.env.ELIZA_API_TOKEN = "";
  process.env.ELIZA_API_BIND = "127.0.0.1";
  process.env.ELIZA_API_PORT = "0";
  process.env.DOOLITTLE_MODE = "api";
  process.env.DOOLITTLE_NATIVE_RUNTIME = "1";
  process.env.DOOLITTLE_DESKTOP_RUNTIME = "0";
  process.env.DOOLITTLE_BOT_RUNTIME = "";
  process.env.DOOLITTLE_WORKSPACE_DIR = profile.workspace;
  process.env.DOOLITTLE_DATA_DIR = profile.dataDir;
  process.env.PGLITE_DATA_DIR = join(profile.dataDir, "pglite");
  process.env.DATABASE_URL = "";
  process.env.POSTGRES_URL = "";
  loadLocalRuntimeEnv();
  delete process.env.ELIZA_API_TOKEN;

  let requestStop = () => {};
  let finishClose = () => {};
  const stop = new Promise<void>((resolve) => {
    requestStop = resolve;
  });
  const closed = new Promise<void>((resolve) => {
    finishClose = resolve;
  });
  let closingReason: string | undefined;
  let shutdownDeadline: ReturnType<typeof setTimeout> | undefined;
  const close = (reason: string) => {
    if (closingReason) return;
    closingReason = reason;
    shutdownDeadline = setTimeout(() => {
      process.stderr.write("[doolittle] Native runtime shutdown timed out.\n");
      process.exit(1);
    }, 3_000);
    requestStop();
  };
  const onPipeClose = () =>
    close("Native Doolittle host closed its lifetime pipe.");
  process.stdin.once("end", onPipeClose);
  process.stdin.once("close", onPipeClose);
  process.stdin.once("error", onPipeClose);
  process.stdin.resume();
  if (process.stdin.readableEnded || process.stdin.destroyed) onPipeClose();
  const signals = installRuntimeProcessLifecycle({
    label: "Native Doolittle API",
    watchHostDisconnect: false,
    async close(reason) {
      close(reason);
      await closed;
    },
  });
  let listener:
    | Awaited<
        ReturnType<typeof import("@doolittle/agent/server").createApiServer>
      >
    | undefined;
  let application:
    | ReturnType<
        typeof import("@doolittle/agent/runtime/application").getApplicationSession
      >
    | undefined;
  let botHost: ReturnType<typeof createNativeBotHost> | undefined;
  let hydrationTimer: ReturnType<typeof setTimeout> | undefined;
  let cancelActiveRuns: (() => number) | undefined;
  try {
    if (closingReason) return;
    const [{ getApplicationSession }, { createApiServer }] = await Promise.all([
      import("@doolittle/agent/runtime/application"),
      import("@doolittle/agent/server"),
    ]);
    if (closingReason) return;
    application = getApplicationSession();
    const context = await application.ensureRuntime({
      startupMode: "api",
      eagerDeferredHydration: false,
    });
    cancelActiveRuns = () =>
      context.services.runController.cancelAllActiveRuns();
    if (closingReason) return;
    if (capabilities.controlPlane) {
      botHost = createNativeBotHost({
        endpoint: () => listener?.address.url,
        agentId: context.runtime.agentId,
        name: context.config.agentName,
        dataDir: profile.dataDir,
        workspace: profile.workspace,
        bearerToken,
      });
    }
    listener = await createApiServer(context, {
      nativeClient: {
        bearerToken,
        ...capabilities,
        dispatchNamedBotControl: botHost?.dispatch,
        reserveLeadConversation: botHost?.reserveLeadConversation,
        workspaceIsCurrent: () =>
          context.config.workspaceDir === profile.workspace &&
          profile.workspaceIsCurrent(),
      },
      requestTimeoutMs: 20_000,
      headersTimeoutMs: 10_000,
      maxRequestBodyBytes: 1024 * 1024,
      shutdownTimeoutMs: 2_000,
    });
    if (closingReason) return;
    console.log(
      `DOOLITTLE_NATIVE_READY ${JSON.stringify({ url: listener.address.url })}`,
    );
    hydrationTimer = setTimeout(() => {
      void context.ensureDeferredHydration("native-api").catch((error) => {
        context.services.logger.captureError(
          "native-api-hydration-failed",
          error,
        );
      });
    }, 500);
    hydrationTimer.unref();
    await stop;
  } finally {
    clearTimeout(hydrationTimer);
    signals.dispose();
    process.stdin.removeListener("end", onPipeClose);
    process.stdin.removeListener("close", onPipeClose);
    process.stdin.removeListener("error", onPipeClose);
    process.stdin.pause();
    try {
      // Let lead turns begin unwinding while the bot host and HTTP listener
      // close. The application still verifies runtime drain before exiting.
      cancelActiveRuns?.();
      try {
        try {
          await botHost?.close();
        } finally {
          await listener?.close();
        }
      } finally {
        await application?.dispose(closingReason, { fast: true });
      }
    } finally {
      clearTimeout(shutdownDeadline);
      finishClose();
    }
  }
}
