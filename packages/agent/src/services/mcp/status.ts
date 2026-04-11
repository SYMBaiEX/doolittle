import {
  type CommandBridgeStatusBase,
  createCommandBridgeStatus,
} from "../bridge-status";

export interface McpSettings {
  serverCommand: string;
  timeoutMs: number;
}

export interface McpServiceStatus extends CommandBridgeStatusBase {
  discoveredTools: number;
  cachedToolNames: string[];
  lastDiscoveryAt?: string;
}

export interface McpServiceStatusInput {
  command?: string;
  timeoutMs: number;
  discoveredTools: string[];
  lastProbeAt?: string;
  lastDiscoveryAt?: string;
  lastInvocationAt?: string;
  lastError?: string;
}

export function createMcpServiceStatus(
  input: McpServiceStatusInput,
): McpServiceStatus {
  return {
    ...createCommandBridgeStatus({
      command: input.command,
      timeoutMs: input.timeoutMs,
      detail: input.command
        ? `MCP bridge command is configured for structured discovery and invocation. Cached tools: ${input.discoveredTools.length}.`
        : "MCP bridge surface is reserved locally but no MCP client is configured yet.",
      lastProbeAt: input.lastProbeAt,
      lastInvocationAt: input.lastInvocationAt,
      lastError: input.lastError,
    }),
    discoveredTools: input.discoveredTools.length,
    cachedToolNames: input.discoveredTools,
    lastDiscoveryAt: input.lastDiscoveryAt,
  };
}
