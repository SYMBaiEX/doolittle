export interface McpServiceStatus {
  enabled: boolean;
  detail: string;
  serverCount: number;
  connectedServers: number;
  failedServers: number;
  discoveredTools: number;
  cachedToolNames: string[];
  servers: McpServerStatusSummary[];
  lastProbeAt?: string;
  lastDiscoveryAt?: string;
  lastInvocationAt?: string;
  lastError?: string;
}

export interface McpServerStatusSummary {
  name: string;
  status: "connecting" | "connected" | "disconnected";
  toolCount: number;
  resourceCount: number;
  resourceTemplateCount: number;
  error?: string;
}

export interface McpServiceStatusInput {
  configuredServers: number;
  connectedServers: number;
  failedServers: number;
  discoveredTools: string[];
  servers: McpServerStatusSummary[];
  lastProbeAt?: string;
  lastDiscoveryAt?: string;
  lastInvocationAt?: string;
  lastError?: string;
}

export function createMcpServiceStatus(
  input: McpServiceStatusInput,
): McpServiceStatus {
  return {
    enabled: input.configuredServers > 0,
    detail:
      input.configuredServers > 0
        ? `Official Eliza MCP service: ${input.connectedServers}/${input.configuredServers} servers connected with ${input.discoveredTools.length} tools.`
        : "No servers are configured in Eliza settings.mcp.servers.",
    serverCount: input.configuredServers,
    connectedServers: input.connectedServers,
    failedServers: input.failedServers,
    discoveredTools: input.discoveredTools.length,
    cachedToolNames: input.discoveredTools,
    servers: input.servers,
    lastProbeAt: input.lastProbeAt,
    lastDiscoveryAt: input.lastDiscoveryAt,
    lastInvocationAt: input.lastInvocationAt,
    lastError: input.lastError,
  };
}
