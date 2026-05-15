import {
  generateMcpConfigFromServerDetails,
  getMcpServerDetails,
  searchMcpMarketplace,
} from "@elizaos/autonomous/services/mcp-marketplace";
import type { AppServices } from "@/services";
import type { RuntimeLike } from "../runtime-contracts";
import { getNativeMcp } from "./native-services";

const MCP_MARKETPLACE_SOURCE = "@elizaos/autonomous/services/mcp-marketplace";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function getEffectiveMcpStatus(
  runtime: RuntimeLike,
  services: AppServices,
) {
  return getNativeMcp(runtime)?.status() ?? services.mcp.status();
}

export async function probeEffectiveMcp(
  runtime: RuntimeLike,
  services: AppServices,
) {
  return (await getNativeMcp(runtime)?.probe()) ?? services.mcp.probe();
}

export async function discoverEffectiveMcpTools(
  runtime: RuntimeLike,
  services: AppServices,
) {
  return (
    (await getNativeMcp(runtime)?.discoverTools()) ??
    services.mcp.discoverTools()
  );
}

export function getEffectiveCachedMcpTools(
  runtime: RuntimeLike,
  services: AppServices,
) {
  return (
    getNativeMcp(runtime)?.getCachedTools() ?? services.mcp.getCachedTools()
  );
}

export function searchEffectiveCachedMcpTools(
  runtime: RuntimeLike,
  services: AppServices,
  query: string,
) {
  return (
    getNativeMcp(runtime)?.searchCachedTools(query) ??
    services.mcp.searchCachedTools(query)
  );
}

export function describeEffectiveCachedMcpTools(
  runtime: RuntimeLike,
  services: AppServices,
  limit = 20,
) {
  return (
    getNativeMcp(runtime)?.describeCachedTools(limit) ??
    services.mcp.describeCachedTools(limit)
  );
}

export function describeEffectiveMcpTool(
  runtime: RuntimeLike,
  services: AppServices,
  name: string,
) {
  return (
    getNativeMcp(runtime)?.describeTool(name) ?? services.mcp.describeTool(name)
  );
}

export async function invokeEffectiveMcp(
  runtime: RuntimeLike,
  services: AppServices,
  input: string,
) {
  return (
    (await getNativeMcp(runtime)?.invoke(input)) ?? services.mcp.invoke(input)
  );
}

export async function invokeEffectiveMcpTool(
  runtime: RuntimeLike,
  services: AppServices,
  name: string,
  input: Record<string, unknown>,
) {
  return (
    (await getNativeMcp(runtime)?.invokeTool(name, input)) ??
    services.mcp.invokeTool(name, input)
  );
}

export async function searchEffectiveMcpMarketplace(query: string, limit = 10) {
  try {
    const result = await searchMcpMarketplace(query, limit);
    return {
      available: true,
      source: MCP_MARKETPLACE_SOURCE,
      query,
      limit,
      ...result,
    };
  } catch (error) {
    return {
      available: false,
      source: MCP_MARKETPLACE_SOURCE,
      query,
      limit,
      results: [],
      error: errorMessage(error),
    };
  }
}

export async function getEffectiveMcpMarketplaceServer(name: string) {
  try {
    const server = await getMcpServerDetails(name);
    return {
      available: true,
      source: MCP_MARKETPLACE_SOURCE,
      name,
      server,
      config: server ? generateMcpConfigFromServerDetails(server) : null,
    };
  } catch (error) {
    return {
      available: false,
      source: MCP_MARKETPLACE_SOURCE,
      name,
      server: null,
      config: null,
      error: errorMessage(error),
    };
  }
}
