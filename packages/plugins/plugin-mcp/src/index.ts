import {
  Service as ElizaService,
  type IAgentRuntime,
  type Plugin,
} from "@elizaos/core";
import type { McpService as AgentMcpService } from "@/services/mcp-service";

export interface McpPluginOptions {
  mcp: Pick<
    AgentMcpService,
    | "status"
    | "probe"
    | "discoverTools"
    | "invoke"
    | "invokeTool"
    | "getCachedTools"
    | "searchCachedTools"
    | "describeCachedTools"
    | "describeTool"
  >;
}

export function createMcpPlugin(options: McpPluginOptions): Plugin {
  class McpService extends ElizaService {
    static serviceType = "mcp";
    capabilityDescription =
      "Official-style MCP service backed by Eliza Agent tool discovery and invocation.";

    static async start(runtime: IAgentRuntime): Promise<ElizaService> {
      return new McpService(runtime);
    }

    async stop(): Promise<void> {
      return;
    }

    status() {
      return options.mcp.status();
    }

    probe() {
      return options.mcp.probe();
    }

    discoverTools() {
      return options.mcp.discoverTools();
    }

    invoke(input: string) {
      return options.mcp.invoke(input);
    }

    invokeTool(...args: Parameters<AgentMcpService["invokeTool"]>) {
      const [name, input] = args;
      return options.mcp.invokeTool(name, input);
    }

    getCachedTools() {
      return options.mcp.getCachedTools();
    }

    searchCachedTools(query: string) {
      return options.mcp.searchCachedTools(query);
    }

    describeCachedTools(limit = 20) {
      return options.mcp.describeCachedTools(limit);
    }

    describeTool(name: string) {
      return options.mcp.describeTool(name);
    }
  }

  return {
    name: "mcp",
    description:
      "Official-style MCP plugin layered onto Eliza Agent MCP discovery and invocation.",
    services: [McpService],
  };
}

export default createMcpPlugin;
