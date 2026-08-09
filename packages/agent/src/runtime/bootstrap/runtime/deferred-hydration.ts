import type { Plugin } from "@elizaos/core";
import { formatError } from "@/runtime/bootstrap/recovery/error-format";
import type { AppServices } from "@/services";

const MAX_DEFERRED_PLUGIN_ATTEMPTS = 3;

type DeferredPluginState = {
  attempts: number;
  registered: boolean;
  detail?: string;
};

function pluginLabel(plugin: Plugin, index: number): string {
  return plugin.name?.trim() || `deferred-plugin-${index + 1}`;
}

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

  const pluginStates = new Map<string, DeferredPluginState>();
  let deferredPluginsSettled = false;
  let deferredHydrationComplete = false;
  let deferredHydrationPromise: Promise<void> | undefined;

  const ensureDeferredPlugins = async (): Promise<void> => {
    if (deferredPluginsSettled) {
      return;
    }

    services.startupState.markWarming(
      "runtime",
      "registering deferred runtime plugins",
    );
    const deferredPlugins = await loadDeferredPlugins();
    const failures: string[] = [];
    for (const [index, plugin] of deferredPlugins.entries()) {
      const label = pluginLabel(plugin, index);
      const state = pluginStates.get(label) ?? {
        attempts: 0,
        registered: false,
      };
      if (state.registered || state.attempts >= MAX_DEFERRED_PLUGIN_ATTEMPTS) {
        if (!state.registered && state.detail) failures.push(state.detail);
        continue;
      }
      try {
        await registerPlugin(plugin);
        pluginStates.set(label, {
          attempts: state.attempts + 1,
          registered: true,
        });
      } catch (error) {
        const attempts = state.attempts + 1;
        const detail = `${label}: ${formatError(error)} (attempt ${attempts}/${MAX_DEFERRED_PLUGIN_ATTEMPTS})`;
        pluginStates.set(label, {
          attempts,
          registered: false,
          detail,
        });
        failures.push(detail);
        process.stderr.write(
          `[doolittle] deferred plugin failed — ${detail}\n`,
        );
      }
    }
    deferredPluginsSettled = [...pluginStates.values()].every(
      (state) =>
        state.registered || state.attempts >= MAX_DEFERRED_PLUGIN_ATTEMPTS,
    );
    services.startupState.markReady(
      "runtime",
      failures.length > 0
        ? `runtime ready; deferred plugin degradation: ${failures.join("; ")}`
        : "runtime ready",
    );
  };

  return async (reason?: string): Promise<void> => {
    if (deferredHydrationComplete) return;
    if (!deferredHydrationPromise) {
      const attempt = (async () => {
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
        deferredHydrationComplete = deferredPluginsSettled;
      })();
      deferredHydrationPromise = attempt.catch((error) => {
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

    const currentAttempt = deferredHydrationPromise;
    try {
      await currentAttempt;
    } finally {
      if (deferredHydrationPromise === currentAttempt) {
        deferredHydrationPromise = undefined;
      }
    }
  };
}
