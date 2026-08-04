import { DOOLITTLE_MCP_SERVICE } from "@doolittle/contracts";
import {
  Service as ElizaService,
  type IAgentRuntime,
  type Service,
  type ServiceClass,
} from "@elizaos/core";
import type { AppServices } from "@/services";

export function createMcpRuntimeService(services: AppServices): ServiceClass {
  class McpRuntimeService extends ElizaService {
    static serviceType = DOOLITTLE_MCP_SERVICE;

    capabilityDescription =
      "Discovers and invokes configured MCP tools with cached tool metadata.";

    // biome-ignore lint/complexity/noUselessConstructor: ElizaOS ServiceClass expects an optional runtime constructor.
    constructor(runtime?: IAgentRuntime) {
      super(runtime);
    }

    static async start(runtime: IAgentRuntime): Promise<Service> {
      return new McpRuntimeService(runtime);
    }

    status() {
      return services.mcp.status();
    }

    probe() {
      return services.mcp.probe();
    }

    discoverTools() {
      return services.mcp.discoverTools();
    }

    invoke(input: string) {
      return services.mcp.invoke(input);
    }

    invokeTool(name: string, input: Record<string, unknown>) {
      return services.mcp.invokeTool(name, input);
    }

    getCachedTools() {
      return services.mcp.getCachedTools();
    }

    searchCachedTools(query: string) {
      return services.mcp.searchCachedTools(query);
    }

    describeCachedTools(limit = 20) {
      return services.mcp.describeCachedTools(limit);
    }

    describeTool(name: string) {
      return services.mcp.describeTool(name);
    }

    async stop(): Promise<void> {}
  }

  return McpRuntimeService;
}
