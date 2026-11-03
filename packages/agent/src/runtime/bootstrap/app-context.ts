import { AgentRuntime, type UUID } from "@elizaos/core";
import {
  createDocumentsPlugin,
  DocumentService,
} from "@elizaos/plugin-assistant";
import character from "../../character";
import {
  type ApplicationServiceGraph,
  createApplicationServiceGraph,
} from "../application/service-graph";
import {
  applyAccountPoolApiCredentials,
  initializeDoolittleAccountPool,
} from "../native/account-pool/index";
import { buildNativePluginAssembly } from "../native/plugin-registry/index";
import { normalizePlugin } from "../native/plugin-registry/support";
import { composeWorkerCharacter } from "./bot-profile";
import { configureBootstrapContext } from "./context";
import { buildPluginSettings } from "./env/index";
import {
  disposeRuntime,
  type RuntimeOwnershipObserver,
} from "./runtime/initialization";
import { DOOLITTLE_RUNTIME_CAPABILITY_OPTIONS } from "./runtime/capability-options";
import {
  createProviderFailureTemplates,
  initializeElizaRuntime,
} from "./runtime/index";
import { appendBootstrapTrace } from "./trace";
import type { AppContext, AppContextBuildOptions } from "./types";

export async function buildAppContext(
  { eagerDeferredHydration }: AppContextBuildOptions,
  graph: ApplicationServiceGraph = createApplicationServiceGraph(),
  ownership?: RuntimeOwnershipObserver,
): Promise<AppContext> {
  const { config, services, workerBot, bindRuntime } = graph;
  if (process.env.DOOLITTLE_KNOWLEDGE_BROKER === "1") {
    if (
      workerBot?.id !== "knowledge-broker" ||
      workerBot.model.provider !== "offline"
    ) {
      throw new Error(
        "Private knowledge storage requires its fixed offline broker identity.",
      );
    }
    const { default: sqlPlugin } = await import("@elizaos/plugin-sql");
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
    ownership?.acquired(runtime);
    try {
      await runtime.initialize();
      await runtime.getServiceLoadPromise(DocumentService.serviceType);
    } catch (error) {
      await rollbackRuntime(runtime, ownership, error);
      throw error;
    }
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
        ...(workerBot
          ? composeWorkerCharacter(character, workerBot)
          : character),
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
  const runtime = await initializeElizaRuntime(
    createRuntime,
    undefined,
    ownership,
  );
  appendBootstrapTrace("phase:initializeRuntime:done");

  try {
    return await configureBootstrapContext({
      config,
      services,
      runtime,
      loadDeferredPlugins,
      bindRuntime,
      workerBot,
    });
  } catch (error) {
    await rollbackRuntime(runtime, ownership, error);
    throw error;
  }
}

async function rollbackRuntime(
  runtime: AgentRuntime,
  ownership: RuntimeOwnershipObserver | undefined,
  activationError: unknown,
): Promise<void> {
  try {
    await disposeRuntime(
      runtime,
      "Doolittle application activation failure",
      undefined,
      { fast: true },
    );
    ownership?.released(runtime);
  } catch (cleanupError) {
    throw new AggregateError(
      [activationError, cleanupError],
      "Application activation failed and runtime cleanup is incomplete.",
    );
  }
}
