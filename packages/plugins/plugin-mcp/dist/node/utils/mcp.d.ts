import type { IAgentRuntime, Memory } from "@elizaos/core";
import type { McpProvider, McpServer } from "../types";
export declare function createMcpMemory(runtime: IAgentRuntime, message: Memory, type: "tool" | "resource", serverName: string, content: string, metadata: Readonly<Record<string, unknown>>): Promise<void>;
export declare function buildMcpProviderData(servers: readonly McpServer[]): McpProvider;
//# sourceMappingURL=mcp.d.ts.map