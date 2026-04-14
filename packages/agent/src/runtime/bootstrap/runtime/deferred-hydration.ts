import type { Plugin } from "@elizaos/core";
import { formatError } from "@/runtime/bootstrap/recovery/error-format";
import type { AppServices } from "@/services";

export function createDeferredHydrator(params: {
  services: AppServices;
  loadDeferredPlugins(): Promise<Plugin[]>;
  registerPlugin(plugin: Plugin): Promise<void>;
  ensureGateway(): void;
  startScheduler(): Promise<void>;
  warmSupportServices(): void;
}) {
  const {
    services,
    loadDeferredPlugins,
    registerPlugin,
    ensureGateway,
    startScheduler,
    warmSupportServices,
  } = params;

  let deferredPluginsRegistered = false;
  let deferredHydrationPromise: Promise<void> | undefined;

  const ensureDeferredPlugins = async (): Promise<void> => {
    if (deferredPluginsRegistered) {
      return;
    }

    services.startupState.markWarming(
      "runtime",
      "registering deferred runtime plugins",
    );
    const deferredPlugins = await loadDeferredPlugins();
    for (const plugin of deferredPlugins) {
      await registerPlugin(plugin);
    }
    deferredPluginsRegistered = true;
    services.startupState.markReady("runtime", "runtime ready");
  };

  return async (reason?: string): Promise<void> => {
    if (!deferredHydrationPromise) {
      deferredHydrationPromise = (async () => {
        const phaseSuffix = reason ? ` (${reason})` : "";

        await ensureDeferredPlugins();

        if (
          services.startupState.getSnapshot().phases.gateway.status !== "ready"
        ) {
          ensureGateway();
        }

        if (
          services.startupState.getSnapshot().phases.cron.status !== "ready"
        ) {
          services.startupState.markWarming(
            "cron",
            `starting scheduler${phaseSuffix}`,
          );
          await startScheduler();
          services.startupState.markReady("cron", "scheduler ready");
        }

        warmSupportServices();
      })().catch((error) => {
        const detail = formatError(error);
        if (
          services.startupState.getSnapshot().phases.gateway.status ===
          "warming"
        ) {
          services.startupState.markError("gateway", detail);
        }
        if (
          services.startupState.getSnapshot().phases.cron.status === "warming"
        ) {
          services.startupState.markError("cron", detail);
        }
        throw error;
      });
    }

    await deferredHydrationPromise;
  };
}
