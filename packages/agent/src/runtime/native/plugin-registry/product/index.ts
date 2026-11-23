import { join } from "node:path";
import { type BotDefinition, bindPluginStorage } from "@doolittle/contracts";
import { createDoolittlePlugin } from "@doolittle/plugins/doolittle-plugin/plugin";
import { createDoolittleRuntimeRoutes } from "@doolittle/plugins/doolittle-plugin/routes";
import {
  createSdkCapabilitiesRuntimeService,
  createSdkCapabilityEvents,
} from "@doolittle/plugins/doolittle-plugin/sdk-capabilities";
import { createSecretsVaultPersistenceService } from "@doolittle/plugins/doolittle-plugin/secrets-vault";
import { createShortcutCompatibleWebSearchAction } from "@doolittle/plugins/doolittle-plugin/web-search-action";
import { triggerAction } from "@elizaos/agent/actions/trigger";
import { webFetch } from "@elizaos/agent/runtime/actions/web-fetch";
import type { Evaluator, Provider } from "@elizaos/core";
import { getSessionProviders } from "@elizaos/core";
import type { HttpPlugin as Plugin } from "@elizaos/host/protocol";
import { memoryAction } from "@elizaos/plugin-assistant";
import { createAppServerAction } from "../../../../actions/app-server-action";
import { createBrowserAnalysisAction } from "../../../../actions/browser-analysis-action";
import { createCodingAction } from "../../../../actions/coding-action";
import { createCommandAction } from "../../../../actions/command-action";
import { createConsultBotAction } from "../../../../actions/consult-bot-action";
import { createFileActions } from "../../../../actions/file-action/index";
import { createMediaActions } from "../../../../actions/media-action";
import {
  createParallelWorkspaceInspectionAction,
  PARALLEL_WORKSPACE_INSPECTION,
} from "../../../../actions/parallel-workspace-inspection";
import { createRepositoryAction } from "../../../../actions/repository-action";
import { createResearchAction } from "../../../../actions/research-action";
import { createSdkTerminalAction } from "../../../../actions/sdk-terminal-action";
import { createSessionSearchAction } from "../../../../actions/session-search-action";
import { createShellCommandAction } from "../../../../actions/shell-command-action";
import { createWorkspaceAction } from "../../../../actions/workspace-action/index";
import { createMemoryNudgeEvaluator } from "../../../../evaluators/memory-nudge-evaluator";
import { noToolsResponseField } from "../../../../evaluators/no-tools-response-field";
import { noToolsRoutingEvaluator } from "../../../../evaluators/no-tools-routing-evaluator";
import { workspaceMutationRoutingEvaluator } from "../../../../evaluators/workspace-mutation-routing-evaluator";
import { createAgentContextProviders } from "../../../../providers/agent-context/index";
import { createSelfAwarenessProvider } from "../../../../providers/self-awareness/index";
import type { AppServices } from "../../../../services/index";
import type { EnvConfig } from "../../../../types/runtime/index";
import { createAutomationExecutor } from "../../../bootstrap/runtime/automation-executor";
import { createGatewayAccessor } from "../../../bootstrap/runtime/gateway-factory";
import {
  createRunProgressEvents,
  createRunProgressRuntimeService,
} from "../../../bootstrap/runtime/index";
import { PgliteMaintenanceService } from "../../../bootstrap/runtime/pglite-maintenance";
import { createAwarenessRuntimeService } from "./awareness-service";
import { createBrowserRuntimeService } from "./browser-service";
import { createGatewayRuntimeService } from "./gateway-service";
import { createMcpRuntimeService } from "./mcp-service";
import { createSchedulerRuntimeService } from "./scheduler-service";
import { createShellRuntimeService } from "./shell-service";
import { createTriggerRuntimeServices } from "./trigger-runtime-service";

export const DOOLITTLE_RUNTIME_PLUGIN_ID = "doolittle-runtime";

export function createDoolittleProductPlugin(
  services: AppServices,
  config: EnvConfig,
  workerBot?: BotDefinition | null,
): Plugin {
  const availableActions = [
    createCodingAction(),
    createConsultBotAction(services),
    createAppServerAction(services),
    createBrowserAnalysisAction(services),
    createCommandAction(services, config),
    createShellCommandAction(services, config),
    createSessionSearchAction(services.sessions, config.sessionSearchLimit),
    memoryAction,
    triggerAction,
    ...createFileActions(),
    createParallelWorkspaceInspectionAction(services.workspace),
    createWorkspaceAction(),
    createSdkTerminalAction(services),
    createRepositoryAction(),
    createShortcutCompatibleWebSearchAction(),
    webFetch,
    createResearchAction(),
    ...createMediaActions(services),
  ];
  const actions = workerBot
    ? availableActions.filter(
        (action) =>
          (action.name === "DOOLITTLE_CONSULT_BOT"
            ? workerBot.permissions.allowDelegation
            : action.name === PARALLEL_WORKSPACE_INSPECTION ||
              workerBot.permissions.allowMutation) &&
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
        PgliteMaintenanceService,
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
