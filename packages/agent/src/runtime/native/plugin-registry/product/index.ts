import { join } from "node:path";

import { type BotDefinition, bindPluginStorage } from "@doolittle/contracts";
import { memoryAction } from "@elizaos/agent/actions/memories";
import { triggerAction } from "@elizaos/agent/actions/trigger";
import { webFetch } from "@elizaos/agent/runtime/actions/web-fetch";
import type { Action, Evaluator, Plugin, Provider } from "@elizaos/core";
import { getSessionProviders } from "@elizaos/core";
import { createDoolittlePlugin } from "@plugins/doolittle-plugin/plugin";
import { createDoolittleRuntimeRoutes } from "@plugins/doolittle-plugin/routes";
import {
  createSdkCapabilitiesRuntimeService,
  createSdkCapabilityEvents,
} from "@plugins/doolittle-plugin/sdk-capabilities";
import {
  createShortcutCompatibleWebSearchAction,
  DOOLITTLE_SDK_SHORTCUTS,
} from "@plugins/doolittle-plugin/sdk-native-surface";
import { createSecretsVaultPersistenceService } from "@plugins/doolittle-plugin/secrets-vault";
import { createAppServerAction } from "@/actions/app-server-action";
import { createBrowserAnalysisAction } from "@/actions/browser-analysis-action";
import { createCodingAction } from "@/actions/coding-action";
import {
  createCommandAction,
  createCommandShortcut,
} from "@/actions/command-action";
import { createConsultBotAction } from "@/actions/consult-bot-action";
import { createFileActions } from "@/actions/file-action";
import { createMediaActions } from "@/actions/media-action";
import { createRepositoryAction } from "@/actions/repository-action";
import { createResearchAction } from "@/actions/research-action";
import { createSdkTerminalAction } from "@/actions/sdk-terminal-action";
import { createSessionSearchAction } from "@/actions/session-search-action";
import {
  createShellCommandAction,
  createShellCommandShortcut,
} from "@/actions/shell-command-action";
import { createWorkspaceAction } from "@/actions/workspace-action";
import { createMemoryNudgeEvaluator } from "@/evaluators/memory-nudge-evaluator";
import { noToolsResponseField } from "@/evaluators/no-tools-response-field";
import { noToolsRoutingEvaluator } from "@/evaluators/no-tools-routing-evaluator";
import { workspaceMutationRoutingEvaluator } from "@/evaluators/workspace-mutation-routing-evaluator";
import { createAgentContextProviders } from "@/providers/agent-context";
import { createSelfAwarenessProvider } from "@/providers/self-awareness";
import {
  createRunProgressEvents,
  createRunProgressRuntimeService,
} from "@/runtime/bootstrap/runtime";
import { createAutomationExecutor } from "@/runtime/bootstrap/runtime/automation-executor";
import { createGatewayAccessor } from "@/runtime/bootstrap/runtime/gateway-factory";
import type { AppServices } from "@/services";
import type { EnvConfig } from "@/types/runtime";
import { createAwarenessRuntimeService } from "./awareness-service";
import { createBrowserRuntimeService } from "./browser-service";
import { createGatewayRuntimeService } from "./gateway-service";
import { createMcpRuntimeService } from "./mcp-service";
import { createMemoryStorageService } from "./memory-storage-service";
import { createSchedulerRuntimeService } from "./scheduler-service";
import { createShellRuntimeService } from "./shell-service";
import { createTriggerRuntimeServices } from "./trigger-runtime-service";

export const DOOLITTLE_RUNTIME_PLUGIN_ID = "doolittle-runtime";

function withToolPolicyOwnership(actions: Action[]): Action[] {
  return actions.map((action) =>
    Object.assign(action, { pluginId: DOOLITTLE_RUNTIME_PLUGIN_ID }),
  );
}

export function createDoolittleProductPlugin(
  services: AppServices,
  config: EnvConfig,
  workerBot?: BotDefinition | null,
): Plugin {
  const availableActions = withToolPolicyOwnership([
    createCodingAction(),
    createConsultBotAction(services),
    createAppServerAction(services),
    createBrowserAnalysisAction(services),
    createCommandAction(services, config),
    createShellCommandAction(services, config),
    createSessionSearchAction(config.sessionSearchLimit),
    memoryAction,
    triggerAction,
    ...createFileActions(),
    createWorkspaceAction(),
    createSdkTerminalAction(services),
    createRepositoryAction(),
    createShortcutCompatibleWebSearchAction(),
    webFetch,
    createResearchAction(),
    ...createMediaActions(services),
  ]);
  const actions = workerBot
    ? availableActions.filter(
        (action) =>
          (action.name === "DOOLITTLE_CONSULT_BOT"
            ? workerBot.permissions.allowDelegation
            : workerBot.permissions.allowMutation) &&
          workerBot.permissions.toolIds.includes(action.name) &&
          action !== triggerAction,
      )
    : availableActions;
  const providers: Provider[] = [
    ...getSessionProviders(),
    ...createAgentContextProviders(services),
    createSelfAwarenessProvider(),
  ];
  const evaluators: Evaluator[] = [createMemoryNudgeEvaluator(services)];
  const gateway = createGatewayRuntimeService({ services, config });
  const secretsVaultStorage = bindPluginStorage("autocoder", {
    dataRoot: join(config.dataDir, "plugins"),
  });
  const triggerRuntimeServices = createTriggerRuntimeServices((runtime) => {
    const gatewayAccessor = createGatewayAccessor({ services, runtime });
    return createAutomationExecutor({
      config,
      services,
      runtime,
      ensureGateway: () => gatewayAccessor.get(),
    });
  });

  return createDoolittlePlugin(
    {
      name: DOOLITTLE_RUNTIME_PLUGIN_ID,
      description:
        "Persistent memory, skills, search, and scheduling for Doolittle on ElizaOS.",
      actions,
      providers,
      shortcuts: [
        ...DOOLITTLE_SDK_SHORTCUTS,
        createShellCommandShortcut(),
        createCommandShortcut(config.workspaceDir),
      ],
      evaluators,
      responseHandlerEvaluators: [
        workspaceMutationRoutingEvaluator,
        noToolsRoutingEvaluator,
      ],
      responseHandlerFieldEvaluators: [noToolsResponseField],
      events: {
        ...createRunProgressEvents(services),
        ...createSdkCapabilityEvents(),
      },
      routes: createDoolittleRuntimeRoutes({ services, config }),
      services: [
        createMemoryStorageService(services.sessions, config.dataDir),
        createAwarenessRuntimeService(services),
        ...(workerBot
          ? []
          : [
              createBrowserRuntimeService(services),
              gateway,
              createMcpRuntimeService(services),
              createSchedulerRuntimeService(services),
            ]),
        createShellRuntimeService(services),
        createRunProgressRuntimeService(services),
        createSdkCapabilitiesRuntimeService(),
        ...(workerBot
          ? []
          : [
              createSecretsVaultPersistenceService(secretsVaultStorage.rootDir),
              ...triggerRuntimeServices,
            ]),
      ],
    },
    config,
  );
}
