import {
  describeEffectiveCachedMcpTools,
  describeEffectiveMcpTool,
  discoverEffectiveMcpTools,
  getEffectiveCachedMcpTools,
  getEffectiveMcpStatus,
  invokeEffectiveMcp,
  invokeEffectiveMcpTool,
  searchEffectiveCachedMcpTools,
} from "@/runtime/native/service-bridge/tooling";
import type { AgentExecutionContext } from "../../chat";
import { parseNamedToolPayload } from "./shared";

export async function handleMcpCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed === "/mcp" || trimmed === "/mcp status") {
    return JSON.stringify(
      getEffectiveMcpStatus(context.runtime, context.services),
      null,
      2,
    );
  }

  if (trimmed === "/mcp tools") {
    return JSON.stringify(
      await discoverEffectiveMcpTools(context.runtime, context.services),
      null,
      2,
    );
  }

  if (trimmed === "/mcp cached") {
    return JSON.stringify(
      getEffectiveCachedMcpTools(context.runtime, context.services),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/mcp cached search ")) {
    const query = trimmed.replace("/mcp cached search ", "").trim();
    if (!query) {
      return "Usage: /mcp cached search <query>";
    }
    return JSON.stringify(
      searchEffectiveCachedMcpTools(context.runtime, context.services, query),
      null,
      2,
    );
  }

  if (trimmed === "/mcp cached describe") {
    return describeEffectiveCachedMcpTools(context.runtime, context.services);
  }

  if (trimmed.startsWith("/mcp cached describe ")) {
    const raw = trimmed.replace("/mcp cached describe ", "").trim();
    const limit = Number(raw);
    return describeEffectiveCachedMcpTools(
      context.runtime,
      context.services,
      Number.isFinite(limit) && limit > 0 ? limit : 20,
    );
  }

  if (trimmed.startsWith("/mcp describe ")) {
    const name = trimmed.replace("/mcp describe ", "").trim();
    if (!name) {
      return "Usage: /mcp describe <tool-name>";
    }
    return describeEffectiveMcpTool(context.runtime, context.services, name);
  }

  if (trimmed.startsWith("/mcp invoke ")) {
    const input = trimmed.replace("/mcp invoke ", "").trim();
    return JSON.stringify(
      await invokeEffectiveMcp(context.runtime, context.services, input),
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
        context.services,
        payload.toolName,
        payload.parsedInput,
      ),
      null,
      2,
    );
  }

  return undefined;
}
