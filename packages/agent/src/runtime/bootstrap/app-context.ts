import {
  AgentRuntime,
  createDocumentsPlugin,
  DocumentService,
  type UUID,
} from "@elizaos/core";
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
import { normalizePlugin } from "@/runtime/native/plugin-registry/support";
import { createServices } from "@/services";
import { readWorkerBotProfile } from "./bot-profile";

export async function buildAppContext({
  startupMode,
  eagerDeferredHydration,
}: AppContextBuildOptions): Promise<AppContext> {
  const config = loadBootstrapConfig();
  const workerBot = readWorkerBotProfile();
  if (workerBot && config.agentName !== workerBot.name) {
    throw new Error("The named bot identity does not match its runtime name.");
  }
  appendBootstrapTrace("phase:createServices:start");
  const services = createServices(config);
  if (workerBot) {
    services.settings.setMany([
      { path: "model.provider", value: workerBot.model.provider },
      { path: "model.model", value: workerBot.model.model },
      ...(workerBot.model.reasoningEffort
        ? [
            {
              path: "model.reasoningEffort",
              value: workerBot.model.reasoningEffort,
            },
          ]
        : []),
    ]);
  }
  appendBootstrapTrace("phase:createServices:done");
  if (process.env.DOOLITTLE_KNOWLEDGE_BROKER === "1") {
    if (
      workerBot?.id !== "knowledge-broker" ||
      workerBot.model.provider !== "offline"
    ) {
      throw new Error(
        "Private knowledge storage requires its fixed offline broker identity.",
      );
    }
    const { default: sqlPlugin } = await import(
      "@doolittle/plugin-sql-relationships"
    );
    const runtime = new AgentRuntime({
      character: {
        ...character,
        id: workerBot.agentId as UUID,
        name: workerBot.name,
        system:
          "Private document storage only. No conversation or autonomous work.",
      },
      plugins: [
        normalizePlugin(sqlPlugin),
        createDocumentsPlugin({ enableActions: false, enableProviders: false }),
      ],
      ...DOOLITTLE_RUNTIME_CAPABILITY_OPTIONS,
    });
    await runtime.initialize();
    await runtime.getServiceLoadPromise(DocumentService.serviceType);
    services.startupState.markReady(
      "runtime",
      "private SDK document worker ready",
    );
    return {
      config,
      services,
      runtime,
      get gateway(): never {
        throw new Error("The private document worker has no gateway.");
      },
      ensureDeferredHydration: async () => undefined,
    };
  }
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
  if (!workerBot) {
    initializeDoolittleAccountPool(config.dataDir);
    // The lead alone owns account selection, refresh, and the credential
    // catalog. Workers receive one approved provider grant from their host.
    await applyAccountPoolApiCredentials({
      activeBackend: runtimeSettings.model.provider,
    });
  }
  appendBootstrapTrace("phase:buildNativePluginAssembly:start");
  const nativePluginAssembly = await buildNativePluginAssembly(
    services,
    config,
    {
      hotOnly: !eagerDeferredHydration,
      workerBot,
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
      const attempt = buildNativePluginAssembly(services, config, {
        workerBot,
      }).then((assembly) => assembly.deferred);
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
        ...(workerBot ? { id: workerBot.agentId as UUID } : {}),
        name: config.agentName,
        ...(workerBot
          ? {
              system: `${character.system ?? ""}\n\nNamed bot persona: ${workerBot.persona}`,
            }
          : {}),
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
