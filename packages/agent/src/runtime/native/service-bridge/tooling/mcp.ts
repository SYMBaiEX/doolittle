import {
  generateMcpConfigFromServerDetails,
  getMcpServerDetails,
  searchMcpMarketplace,
} from "@elizaos/agent/services/mcp-marketplace";
import type { AppServices } from "@/services";
import type { RuntimeLike } from "../runtime-contracts";
import { getNativeMcp } from "./native-services";

const MCP_MARKETPLACE_SOURCE = "@elizaos/agent/services/mcp-marketplace";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function getEffectiveMcpStatus(
  runtime: RuntimeLike,
  services: AppServices,
) {
  const mcp = getNativeMcp(runtime);
  return mcp ? mcp.status() : services.mcp.status();
}

export async function probeEffectiveMcp(
  runtime: RuntimeLike,
  services: AppServices,
) {
  const mcp = getNativeMcp(runtime);
  return mcp ? mcp.probe() : services.mcp.probe();
}

export async function discoverEffectiveMcpTools(
  runtime: RuntimeLike,
  services: AppServices,
) {
  const mcp = getNativeMcp(runtime);
  return mcp ? mcp.discoverTools() : services.mcp.discoverTools();
}

export function getEffectiveCachedMcpTools(
  runtime: RuntimeLike,
  services: AppServices,
) {
  const mcp = getNativeMcp(runtime);
  return mcp ? mcp.getCachedTools() : services.mcp.getCachedTools();
}

export function searchEffectiveCachedMcpTools(
  runtime: RuntimeLike,
  services: AppServices,
  query: string,
) {
  const mcp = getNativeMcp(runtime);
  return mcp
    ? mcp.searchCachedTools(query)
    : services.mcp.searchCachedTools(query);
}

export function describeEffectiveCachedMcpTools(
  runtime: RuntimeLike,
  services: AppServices,
  limit = 20,
) {
  const mcp = getNativeMcp(runtime);
  return mcp
    ? mcp.describeCachedTools(limit)
    : services.mcp.describeCachedTools(limit);
}

export function describeEffectiveMcpTool(
  runtime: RuntimeLike,
  services: AppServices,
  name: string,
) {
  const mcp = getNativeMcp(runtime);
  return mcp ? mcp.describeTool(name) : services.mcp.describeTool(name);
}

export async function invokeEffectiveMcp(
  runtime: RuntimeLike,
  services: AppServices,
  input: string,
) {
  const mcp = getNativeMcp(runtime);
  return mcp ? mcp.invoke(input) : services.mcp.invoke(input);
}

export async function invokeEffectiveMcpTool(
  runtime: RuntimeLike,
  services: AppServices,
  name: string,
  input: Record<string, unknown>,
) {
  const mcp = getNativeMcp(runtime);
  return mcp
    ? mcp.invokeTool(name, input)
    : services.mcp.invokeTool(name, input);
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
