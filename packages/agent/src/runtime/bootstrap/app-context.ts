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
import { deferDesktopDirectApiCredentials } from "../linked-provider-accounts/direct-api";
import {
  applyAccountPoolApiCredentials,
  initializeDoolittleAccountPool,
} from "../native/account-pool/index";
import {
  loadDeferredMessagingPlugins,
  loadDeferredTurnPlugins,
} from "../native/plugin-registry/deferred-groups";
import { buildNativePluginAssembly } from "../native/plugin-registry/index";
import { normalizePlugin } from "../native/plugin-registry/support";
import { composeWorkerCharacter } from "./bot-profile";
import { configureBootstrapContext } from "./context";
import { buildPluginSettings, getPgliteDataDir } from "./env/index";
import { assertPgliteRepairIdle } from "./env/pglite";
import { setDefaultTrajectoryCapture } from "./env/trajectory-capture";
import { DOOLITTLE_RUNTIME_CAPABILITY_OPTIONS } from "./runtime/capability-options";
import {
  createProviderFailureTemplates,
  initializeElizaRuntime,
} from "./runtime/index";
import {
  disposeRuntime,
  type RuntimeOwnershipObserver,
} from "./runtime/initialization";
import { appendBootstrapTrace } from "./trace";
import type { AppContext } from "./types";

export async function buildAppContext(
  graph: ApplicationServiceGraph = createApplicationServiceGraph(),
  ownership?: RuntimeOwnershipObserver,
): Promise<AppContext> {
  const { config, services, workerBot, bindRuntime } = graph;
  assertPgliteRepairIdle(getPgliteDataDir(config));
  setDefaultTrajectoryCapture(process.env);
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
      ensureTurnPlugins: async () => undefined,
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
    if (
      !deferDesktopDirectApiCredentials() &&
      ["openai", "anthropic"].includes(runtimeSettings.model.provider)
    ) {
      await applyAccountPoolApiCredentials({
        activeBackend: runtimeSettings.model.provider,
      });
    }
  }
  const databasePreparation =
    process.env.DOOLITTLE_DISTRIBUTED_DESKTOP_RUNTIME === "1" &&
    process.env.DOOLITTLE_DESKTOP_RUNTIME === "1"
      ? import("./runtime/desktop-database-seed")
          .then(async ({ seedPackagedDesktopPglite }) => {
            appendBootstrapTrace("phase:pglite-seed:start");
            const published = await seedPackagedDesktopPglite(
              config.dataDir,
              getPgliteDataDir(config),
            );
            appendBootstrapTrace(
              published
                ? "phase:pglite-seed:published"
                : "phase:pglite-seed:skipped",
            );
          })
          .catch(() => appendBootstrapTrace("phase:pglite-seed:unavailable"))
      : undefined;
  appendBootstrapTrace("phase:buildNativePluginAssembly:start");
  const nativePluginAssembly = await buildNativePluginAssembly(
    services,
    config,
    workerBot,
  )
    .then((assembly) => {
      appendBootstrapTrace(
        "phase:buildNativePluginAssembly:done",
        `initial=${String(assembly.initial.length)}`,
      );
      return assembly;
    })
    .finally(() => databasePreparation);

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
      loadTurnPlugins: () => loadDeferredTurnPlugins({ services, config }),
      loadMessagingPlugins: () =>
        loadDeferredMessagingPlugins({ services, config }),
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
