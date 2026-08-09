import {
  generateMcpConfigFromServerDetails,
  getMcpServerDetails,
  searchMcpMarketplace,
} from "@elizaos/agent/services/mcp-marketplace";
import type { RuntimeLike } from "../runtime-contracts";
import { requireNativeMcp } from "./native-services";

const MCP_MARKETPLACE_SOURCE = "@elizaos/agent/services/mcp-marketplace";

// beta.7 ignores extra JavaScript arguments. PR elizaOS/eliza#18200 adds these
// options to the public signatures, so this structural boundary starts
// forwarding request cancellation now and becomes fully typed on upgrade.
type McpMarketplaceRequestOptions = { signal?: AbortSignal };
const searchMarketplace = searchMcpMarketplace as unknown as (
  query: string,
  limit: number,
  options?: McpMarketplaceRequestOptions,
) => ReturnType<typeof searchMcpMarketplace>;
const getMarketplaceServer = getMcpServerDetails as unknown as (
  name: string,
  options?: McpMarketplaceRequestOptions,
) => ReturnType<typeof getMcpServerDetails>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function getEffectiveMcpStatus(runtime: RuntimeLike) {
  return requireNativeMcp(runtime).status();
}

export async function probeEffectiveMcp(runtime: RuntimeLike) {
  return requireNativeMcp(runtime).probe();
}

export async function discoverEffectiveMcpTools(runtime: RuntimeLike) {
  return requireNativeMcp(runtime).discoverTools();
}

export function getEffectiveCachedMcpTools(runtime: RuntimeLike) {
  return requireNativeMcp(runtime).getCachedTools();
}

export function searchEffectiveCachedMcpTools(
  runtime: RuntimeLike,
  query: string,
) {
  return requireNativeMcp(runtime).searchCachedTools(query);
}

export function describeEffectiveCachedMcpTools(
  runtime: RuntimeLike,
  limit = 20,
) {
  return requireNativeMcp(runtime).describeCachedTools(limit);
}

export function describeEffectiveMcpTool(runtime: RuntimeLike, name: string) {
  return requireNativeMcp(runtime).describeTool(name);
}

export async function invokeEffectiveMcp(runtime: RuntimeLike, input: string) {
  return requireNativeMcp(runtime).invoke(input);
}

export async function invokeEffectiveMcpTool(
  runtime: RuntimeLike,
  name: string,
  input: Record<string, unknown>,
) {
  return requireNativeMcp(runtime).invokeTool(name, input);
}

export async function searchEffectiveMcpMarketplace(
  query: string,
  limit = 10,
  signal?: AbortSignal,
) {
  try {
    const result = await searchMarketplace(query, limit, { signal });
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

export async function getEffectiveMcpMarketplaceServer(
  name: string,
  signal?: AbortSignal,
) {
  try {
    const server = await getMarketplaceServer(name, { signal });
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
