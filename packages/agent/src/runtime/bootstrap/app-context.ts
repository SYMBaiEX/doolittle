import { AgentRuntime } from "@elizaos/core";
import character from "@/character";
import { configureBootstrapContext } from "@/runtime/bootstrap/context";
import {
  buildPluginSettings,
  loadBootstrapConfig,
} from "@/runtime/bootstrap/env";
import {
  createProviderFailureTemplates,
  initializeElizaRuntime,
} from "@/runtime/bootstrap/runtime";
import { DOOLITTLE_RUNTIME_CAPABILITY_OPTIONS } from "@/runtime/bootstrap/runtime/capability-options";
import { appendBootstrapTrace } from "@/runtime/bootstrap/trace";
import type {
  AppContext,
  AppContextBuildOptions,
} from "@/runtime/bootstrap/types";
import {
  applyAccountPoolApiCredentials,
  initializeDoolittleAccountPool,
} from "@/runtime/native/account-pool";
import { buildNativePluginAssembly } from "@/runtime/native/plugin-registry";
import { createServices } from "@/services";

export async function buildAppContext({
  startupMode,
  eagerDeferredHydration,
}: AppContextBuildOptions): Promise<AppContext> {
  const config = loadBootstrapConfig();
  appendBootstrapTrace("phase:createServices:start");
  const services = createServices(config);
  appendBootstrapTrace("phase:createServices:done");
  services.startupState.markWarming("runtime", "initializing core runtime");
  services.startupState.markDeferred(
    "gateway",
    "will hydrate when remote transport features are needed",
  );
  services.startupState.markDeferred(
    "cron",
    "will hydrate after the shell is interactive",
  );
  const runtimeSettings = services.settings.get();
  initializeDoolittleAccountPool(config.dataDir);
  // Materialize any SDK-owned direct API account before provider assembly so
  // auto-enable sees the native credential and registers the official plugin.
  await applyAccountPoolApiCredentials({
    activeBackend: runtimeSettings.model.provider,
  });
  appendBootstrapTrace("phase:buildNativePluginAssembly:start");
  const nativePluginAssembly = await buildNativePluginAssembly(
    services,
    config,
    {
      hotOnly: !eagerDeferredHydration,
    },
  );
  appendBootstrapTrace(
    "phase:buildNativePluginAssembly:done",
    `initial=${String(nativePluginAssembly.initial.length)} deferred=${String(nativePluginAssembly.deferred.length)}`,
  );

  let deferredPluginsPromise:
    | Promise<typeof nativePluginAssembly.deferred>
    | undefined;
  const loadDeferredPlugins = async () => {
    if (nativePluginAssembly.deferred.length > 0) {
      return nativePluginAssembly.deferred;
    }
    if (!deferredPluginsPromise) {
      const attempt = buildNativePluginAssembly(services, config).then(
        (assembly) => assembly.deferred,
      );
      const retryableAttempt = attempt.catch((error) => {
        if (deferredPluginsPromise === retryableAttempt) {
          deferredPluginsPromise = undefined;
        }
        throw error;
      });
      deferredPluginsPromise = retryableAttempt;
    }
    return deferredPluginsPromise;
  };

  const createRuntime = () =>
    new AgentRuntime({
      character: {
        ...character,
        name: config.agentName,
        advancedMemory: true,
        advancedPlanning: true,
        templates: {
          ...(character.templates ?? {}),
          ...createProviderFailureTemplates(
            () => services.settings.get().model,
          ),
        },
        settings: {
          ...(character.settings ?? {}),
          ...buildPluginSettings(config, services, runtimeSettings),
          nativePluginCatalog: JSON.stringify(nativePluginAssembly.catalog),
        },
      },
      plugins: nativePluginAssembly.initial,
      ...DOOLITTLE_RUNTIME_CAPABILITY_OPTIONS,
    });

  appendBootstrapTrace("phase:initializeRuntime:start");
  const runtime = await initializeElizaRuntime(createRuntime);
  appendBootstrapTrace("phase:initializeRuntime:done");

  return configureBootstrapContext({
    config,
    services,
    runtime,
    eagerDeferredHydration,
    startupMode,
    loadDeferredPlugins,
  });
}
