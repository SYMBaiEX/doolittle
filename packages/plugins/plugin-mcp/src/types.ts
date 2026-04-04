export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpServiceLike {
  status(): {
    enabled: boolean;
    detail: string;
    command?: string;
    timeoutMs: number;
    discoveredTools: number;
    cachedToolNames: string[];
    lastProbeAt?: string;
    lastDiscoveryAt?: string;
    lastInvocationAt?: string;
    lastError?: string;
  };
  probe(): Promise<{
    ok: boolean;
    detail: string;
  }>;
  discoverTools(): Promise<{
    ok: boolean;
    tools: McpToolDefinition[];
    detail: string;
  }>;
  invoke(input: string): Promise<{
    ok: boolean;
    output: string;
  }>;
  invokeTool(
    name: string,
    input: Record<string, unknown>,
  ): Promise<{
    ok: boolean;
    tool: string;
    output: string;
  }>;
  getCachedTools(): McpToolDefinition[];
  searchCachedTools(query: string): McpToolDefinition[];
  describeCachedTools(limit?: number): string;
  describeTool(name: string): string;
}
