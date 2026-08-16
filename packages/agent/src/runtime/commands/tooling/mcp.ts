import {
  describeEffectiveCachedMcpTools,
  describeEffectiveMcpTool,
  discoverEffectiveMcpTools,
  getEffectiveCachedMcpTools,
  getEffectiveMcpMarketplaceServer,
  getEffectiveMcpStatus,
  invokeEffectiveMcp,
  invokeEffectiveMcpTool,
  searchEffectiveCachedMcpTools,
  searchEffectiveMcpMarketplace,
} from "@/runtime/native/service-bridge/tooling";
import type { AgentExecutionContext } from "../../chat";
import { parseNamedToolPayload } from "./shared";

const MAX_CACHED_TOOL_DESCRIPTIONS = 20;
const CACHED_DESCRIBE_USAGE = "Usage: /mcp cached describe [1-20]";

export async function handleMcpCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed === "/mcp" || trimmed === "/mcp status") {
    return JSON.stringify(getEffectiveMcpStatus(context.runtime), null, 2);
  }

  if (trimmed === "/mcp tools") {
    return JSON.stringify(
      await discoverEffectiveMcpTools(context.runtime),
      null,
      2,
    );
  }

  if (trimmed === "/mcp cached") {
    return JSON.stringify(getEffectiveCachedMcpTools(context.runtime), null, 2);
  }

  if (trimmed.startsWith("/mcp cached search ")) {
    const query = trimmed.replace("/mcp cached search ", "").trim();
    if (!query) {
      return "Usage: /mcp cached search <query>";
    }
    return JSON.stringify(
      searchEffectiveCachedMcpTools(context.runtime, query),
      null,
      2,
    );
  }

  if (trimmed === "/mcp cached describe") {
    return describeEffectiveCachedMcpTools(context.runtime);
  }

  if (trimmed === "/mcp marketplace search") {
    return "Usage: /mcp marketplace search <query>";
  }

  if (trimmed.startsWith("/mcp marketplace search ")) {
    const query = trimmed.replace("/mcp marketplace search ", "").trim();
    if (!query) {
      return "Usage: /mcp marketplace search <query>";
    }
    return JSON.stringify(await searchEffectiveMcpMarketplace(query), null, 2);
  }

  if (trimmed === "/mcp marketplace show") {
    return "Usage: /mcp marketplace show <server-name>";
  }

  if (trimmed.startsWith("/mcp marketplace show ")) {
    const name = trimmed.replace("/mcp marketplace show ", "").trim();
    if (!name) {
      return "Usage: /mcp marketplace show <server-name>";
    }
    return JSON.stringify(
      await getEffectiveMcpMarketplaceServer(name),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/mcp cached describe ")) {
    const raw = trimmed.replace("/mcp cached describe ", "").trim();
    const limit = Number(raw);
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > MAX_CACHED_TOOL_DESCRIPTIONS
    ) {
      return CACHED_DESCRIBE_USAGE;
    }
    return describeEffectiveCachedMcpTools(context.runtime, limit);
  }

  if (trimmed.startsWith("/mcp describe ")) {
    const name = trimmed.replace("/mcp describe ", "").trim();
    if (!name) {
      return "Usage: /mcp describe <tool-name>";
    }
    return describeEffectiveMcpTool(context.runtime, name);
  }

  if (trimmed.startsWith("/mcp invoke ")) {
    const input = trimmed.replace("/mcp invoke ", "").trim();
    return JSON.stringify(
      await invokeEffectiveMcp(context.runtime, input),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/mcp call ")) {
    const payload = parseNamedToolPayload(trimmed.replace("/mcp call ", ""));
    if (!payload) {
      return "Usage: /mcp call <toolName> :: <json-input>";
    }
    return JSON.stringify(
      await invokeEffectiveMcpTool(
        context.runtime,
        payload.toolName,
        payload.parsedInput,
      ),
      null,
      2,
    );
  }

  return undefined;
}
