import {
  createAgentContextProviders,
  createCommandAction,
  createCommandShortcut,
  createFileActions,
  createMemoryAction,
  createMemoryNudgeEvaluator,
  createRepositoryAction,
  createResearchAction,
  createSelfAwarenessProvider,
  createSessionSearchAction,
  createTerminalAction,
  createWorkspaceAction,
} from "@doolittle/agent/plugin-api";
import { triggerAction } from "@elizaos/agent/actions/trigger";
import { webFetch } from "@elizaos/agent/runtime/actions/web-fetch";
import type { Action, Evaluator, Plugin, Provider } from "@elizaos/core";
import { getSessionProviders } from "@elizaos/core";
import { createGatewayRuntimeService } from "./gateway-service";
import { createMemoryStorageService } from "./memory-storage-service";
import { createDoolittleRuntimeRoutes } from "./routes";
import { createSchedulerRuntimeService } from "./scheduler-service";
import { wireSdkCapabilities } from "./sdk-capabilities";
import {
  createShortcutCompatibleWebSearchAction,
  DOOLITTLE_SDK_SHORTCUTS,
} from "./sdk-native-surface";
import { createTriggerRuntimeServices } from "./trigger-runtime-service";
import type { DoolittlePluginDependencies } from "./types";

export function createDoolittlePluginSurface({
  services,
  config,
}: DoolittlePluginDependencies): Plugin {
  const actions: Action[] = [
    createCommandAction(services, config),
    createMemoryAction(services),
    createSessionSearchAction(services, config.sessionSearchLimit),
    triggerAction,
    ...createFileActions(() => services.workspace.root()),
    createWorkspaceAction(services, () => services.workspace.root()),
    createTerminalAction(services),
    createRepositoryAction(services),
    createShortcutCompatibleWebSearchAction(),
    webFetch,
    createResearchAction(),
  ];
  const providers: Provider[] = [
    ...getSessionProviders(),
    ...createAgentContextProviders(services),
    createSelfAwarenessProvider(services),
  ];
  const evaluators: Evaluator[] = [createMemoryNudgeEvaluator(services)];
  const GatewayRuntimeService = createGatewayRuntimeService({
    services,
    config,
  });
  const MemoryStorageService = createMemoryStorageService(services.sessions);
  const SchedulerRuntimeService = createSchedulerRuntimeService(services);

  return {
    name: "doolittle-runtime",
    description:
      "Persistent memory, skills, search, and scheduling for Doolittle on ElizaOS.",
    actions,
    providers,
    shortcuts: [
      ...DOOLITTLE_SDK_SHORTCUTS,
      createCommandShortcut(config.workspaceDir),
    ],
    evaluators,
    routes: createDoolittleRuntimeRoutes({ services, config }),
    services: [
      MemoryStorageService,
      GatewayRuntimeService,
      SchedulerRuntimeService,
      ...createTriggerRuntimeServices(services),
    ],
    init: async (_config, runtime) => {
      await wireSdkCapabilities(runtime);
    },
  };
}
