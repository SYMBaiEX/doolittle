import {
  createAgentContextProvider,
  createCronAction,
  createMemoryAction,
  createMemoryNudgeEvaluator,
  createRepositoryAction,
  createSessionSearchAction,
  createSkillsAction,
  createTerminalAction,
  createWorkspaceAction,
} from "@doolittle/agent/plugin-api";
import type { Action, Evaluator, Plugin, Provider } from "@elizaos/core";
import { createGatewayRuntimeService } from "./gateway-service";
import { createSchedulerRuntimeService } from "./scheduler-service";
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
    createWorkspaceAction(services, config.workspaceDir),
    createTerminalAction(services),
    createRepositoryAction(services),
  ];
  const providers: Provider[] = [createAgentContextProvider(services)];
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
  };
}
