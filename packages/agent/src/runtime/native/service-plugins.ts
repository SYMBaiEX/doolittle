import {
  Service as ElizaService,
  type IAgentRuntime,
  type Plugin,
} from "@elizaos/core";
import type { AppServices } from "@/services";

type ServiceMethodMap = Record<string, unknown>;

function createServicePlugin(
  name: string,
  serviceType: string,
  description: string,
  capabilityDescription: string,
  methods: ServiceMethodMap,
): Plugin {
  class NativeBackedService extends ElizaService {
    static serviceType = serviceType;
    capabilityDescription = capabilityDescription;

    static async start(runtime?: IAgentRuntime): Promise<ElizaService> {
      return new NativeBackedService(runtime);
    }

    async stop(): Promise<void> {}
  }

  Object.assign(NativeBackedService.prototype, methods);

  return {
    name,
    description,
    services: [NativeBackedService],
  };
}

export function createNativeShellServicePlugin(services: AppServices): Plugin {
  return createServicePlugin(
    "shell",
    "shell",
    "Native shell plugin backed directly by Eliza Agent execution services.",
    "Native shell service backed directly by Eliza Agent execution services.",
    {
      run(command: string) {
        return services.terminal.run(command);
      },
      history(limit = 20) {
        return services.terminal.getHistory(limit);
      },
      status() {
        return services.terminal.status();
      },
    },
  );
}

export function createNativeMcpServicePlugin(services: AppServices): Plugin {
  return createServicePlugin(
    "mcp",
    "mcp",
    "Native MCP plugin backed directly by Eliza Agent MCP services.",
    "Native MCP service backed directly by Eliza Agent tool discovery and invocation.",
    {
      status() {
        return services.mcp.status();
      },
      probe() {
        return services.mcp.probe();
      },
      discoverTools() {
        return services.mcp.discoverTools();
      },
      invoke(input: string) {
        return services.mcp.invoke(input);
      },
      invokeTool(name: string, input: Record<string, unknown>) {
        return services.mcp.invokeTool(name, input);
      },
      getCachedTools() {
        return services.mcp.getCachedTools();
      },
      searchCachedTools(query: string) {
        return services.mcp.searchCachedTools(query);
      },
      describeCachedTools(limit = 20) {
        return services.mcp.describeCachedTools(limit);
      },
      describeTool(name: string) {
        return services.mcp.describeTool(name);
      },
    },
  );
}

export function createNativeCronServicePlugin(services: AppServices): Plugin {
  return createServicePlugin(
    "cron",
    "cron",
    "Native cron plugin backed directly by Eliza Agent scheduled workflows.",
    "Cron automation service backed directly by Eliza Agent scheduled workflows.",
    {
      list() {
        return services.cron.list();
      },
      get(id: string) {
        return services.cron.get(id);
      },
      create(input: unknown) {
        return services.cron.create(input as never);
      },
      update(id: string, patch: unknown) {
        return services.cron.update(id, patch as never);
      },
      runs(limit = 20) {
        return services.cron.runs(limit);
      },
    },
  );
}

export function createNativePersonalityServicePlugin(
  services: AppServices,
): Plugin {
  return createServicePlugin(
    "personality",
    "personality",
    "Native personality plugin backed directly by Eliza Agent profiles.",
    "Native personality service backed directly by Eliza Agent personality profiles.",
    {
      list() {
        return services.personalities.list();
      },
      get(id: string) {
        return services.personalities.get(id);
      },
      activate(id: string) {
        return services.personalities.setActive(id);
      },
      activeId() {
        return services.personalities.activeId();
      },
      summary() {
        return services.personalities.summary();
      },
    },
  );
}

export function createNativeTrajectoryLoggerServicePlugin(
  services: AppServices,
): Plugin {
  return createServicePlugin(
    "trajectory-logger",
    "trajectory_logger",
    "Native trajectory logger plugin backed directly by Eliza Agent research workflows.",
    "Native trajectory logger service backed directly by Eliza Agent trajectory workflows.",
    {
      exportLatest() {
        return services.trajectories.exportLatest();
      },
      bundles() {
        return services.trajectories.listBundles();
      },
      compareLatest() {
        return services.trajectories.compareLatest();
      },
    },
  );
}
