import {
  createAgentContextProviders,
  createCommandAction,
  createCommandShortcut,
  createFileActions,
  createMemoryNudgeEvaluator,
  createRepositoryAction,
  createResearchAction,
  createRunProgressEvents,
  createRunProgressRuntimeService,
  createSelfAwarenessProvider,
  createSessionSearchAction,
  createWorkspaceAction,
} from "@doolittle/agent/plugin-api";
import { memoryAction } from "@elizaos/agent/actions/memories";
import { terminalAction } from "@elizaos/agent/actions/terminal";
import { triggerAction } from "@elizaos/agent/actions/trigger";
import { webFetch } from "@elizaos/agent/runtime/actions/web-fetch";
import type { Action, Evaluator, Plugin, Provider } from "@elizaos/core";
import { getSessionProviders } from "@elizaos/core";
import { createAwarenessRuntimeService } from "./awareness-service";
import { createBrowserRuntimeService } from "./browser-service";
import { createGatewayRuntimeService } from "./gateway-service";
import { createMcpRuntimeService } from "./mcp-service";
import { createMemoryStorageService } from "./memory-storage-service";
import { createDoolittleRuntimeRoutes } from "./routes";
import { createSchedulerRuntimeService } from "./scheduler-service";
import { wireSdkCapabilities } from "./sdk-capabilities";
import {
  createShortcutCompatibleWebSearchAction,
  DOOLITTLE_SDK_SHORTCUTS,
} from "./sdk-native-surface";
import { createShellRuntimeService } from "./shell-service";
import { createTriggerRuntimeServices } from "./trigger-runtime-service";
import type { DoolittlePluginDependencies } from "./types";

export function createDoolittlePluginSurface({
  services,
  config,
}: DoolittlePluginDependencies): Plugin {
  const actions: Action[] = [
    createCommandAction(services, config),
    createSessionSearchAction(config.sessionSearchLimit),
    memoryAction,
    triggerAction,
    ...createFileActions(),
    createWorkspaceAction(),
    terminalAction,
    createRepositoryAction(),
    createShortcutCompatibleWebSearchAction(),
    webFetch,
    createResearchAction(),
  ];
  const providers: Provider[] = [
    ...getSessionProviders(),
    ...createAgentContextProviders(services),
    createSelfAwarenessProvider(),
  ];
  const evaluators: Evaluator[] = [createMemoryNudgeEvaluator(services)];
  const GatewayRuntimeService = createGatewayRuntimeService({
    services,
    config,
  });
  const AwarenessRuntimeService = createAwarenessRuntimeService(services);
  const BrowserRuntimeService = createBrowserRuntimeService(services);
  const MemoryStorageService = createMemoryStorageService(services.sessions);
  const McpRuntimeService = createMcpRuntimeService(services);
  const SchedulerRuntimeService = createSchedulerRuntimeService(services);
  const ShellRuntimeService = createShellRuntimeService(services);
  const RunProgressRuntimeService = createRunProgressRuntimeService(services);

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
    events: createRunProgressEvents(services),
    routes: createDoolittleRuntimeRoutes({ services, config }),
    services: [
      MemoryStorageService,
      AwarenessRuntimeService,
      BrowserRuntimeService,
      GatewayRuntimeService,
      McpRuntimeService,
      SchedulerRuntimeService,
      ShellRuntimeService,
      RunProgressRuntimeService,
      ...createTriggerRuntimeServices(services),
    ],
    init: async (_config, runtime) => {
      await wireSdkCapabilities(runtime);
    },
  };
}
