import {
  createAgentContextProviders,
  createCronAction,
  createFileActions,
  createMemoryAction,
  createMemoryNudgeEvaluator,
  createRepositoryAction,
  createResearchAction,
  createSelfAwarenessProvider,
  createSessionSearchAction,
  createSkillsAction,
  createTerminalAction,
  createWorkspaceAction,
} from "@doolittle/agent/plugin-api";
import { webFetch } from "@elizaos/agent/runtime/actions/web-fetch";
import type { Action, Evaluator, Plugin, Provider } from "@elizaos/core";
import { getSessionProviders } from "@elizaos/core";
import { createGatewayRuntimeService } from "./gateway-service";
import { createSchedulerRuntimeService } from "./scheduler-service";
import { wireSdkCapabilities } from "./sdk-capabilities";
import {
  createShortcutCompatibleWebSearchAction,
  DOOLITTLE_SDK_SHORTCUTS,
} from "./sdk-native-surface";
import type { DoolittlePluginDependencies } from "./types";

export function createDoolittlePluginSurface({
  services,
  config,
}: DoolittlePluginDependencies): Plugin {
  const actions: Action[] = [
    createMemoryAction(services),
    createSkillsAction(services),
    createSessionSearchAction(services, config.sessionSearchLimit),
    createCronAction(services),
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
  const SchedulerRuntimeService = createSchedulerRuntimeService(services);

  return {
    name: "doolittle-runtime",
    description:
      "Persistent memory, skills, search, and scheduling for Doolittle on ElizaOS.",
    actions,
    providers,
    shortcuts: DOOLITTLE_SDK_SHORTCUTS,
    evaluators,
    services: [GatewayRuntimeService, SchedulerRuntimeService],
    init: async (_config, runtime) => {
      await wireSdkCapabilities(runtime);
    },
  };
}
