import {
  createAgentContextProvider,
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
import type { Action, Evaluator, Plugin, Provider } from "@elizaos/core";
import { getSessionProviders } from "@elizaos/core";
import { createGatewayRuntimeService } from "./gateway-service";
import { createSchedulerRuntimeService } from "./scheduler-service";
import { wireSdkCapabilities } from "./sdk-capabilities";
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
    ...createFileActions(config.workspaceDir),
    createWorkspaceAction(services, config.workspaceDir),
    createTerminalAction(services),
    createRepositoryAction(services),
    createResearchAction(),
  ];
  const providers: Provider[] = [
    ...getSessionProviders(),
    createAgentContextProvider(services),
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
    evaluators,
    services: [GatewayRuntimeService, SchedulerRuntimeService],
    init: async (_config, runtime) => {
      await wireSdkCapabilities(runtime);
    },
  };
}
