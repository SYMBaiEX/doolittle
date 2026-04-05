import {
  describeEffectiveCachedMcpTools,
  describeEffectiveMcpTool,
  discoverEffectiveMcpTools,
  getEffectiveCachedMcpTools,
  getEffectiveMcpStatus,
  getEffectivePluginManagerInventory,
  invokeEffectiveMcp,
  invokeEffectiveMcpTool,
  searchEffectiveCachedMcpTools,
} from "@/runtime/native/service-bridge/index";
import type { AgentExecutionContext } from "../chat";

export async function handleToolingCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed === "/tools" || trimmed === "/tools list") {
    const pluginInventory = getEffectivePluginManagerInventory(context.runtime);
    const toolLines = context.services.tools
      .list()
      .map(
        (tool) =>
          `- ${tool.id} [${tool.enabled ? "enabled" : "disabled"}] ${tool.category}: ${tool.description}`,
      );
    const pluginLines =
      pluginInventory?.plugins.map(
        (plugin) => `- native ${JSON.stringify(plugin)}`,
      ) ?? [];
    return [...toolLines, ...pluginLines].join("\n");
  }

  if (trimmed.startsWith("/tools search ")) {
    const query = trimmed.replace("/tools search ", "").trim();
    if (!query) {
      return "Usage: /tools search <query>";
    }
    const tools = context.services.tools.search(query);
    return tools.length
      ? tools
          .map(
            (tool) =>
              `- ${tool.id} [${tool.enabled ? "enabled" : "disabled"}] ${tool.category}/${tool.transport ?? "service"}: ${tool.description}`,
          )
          .join("\n")
      : `No tools found for query: ${query}`;
  }

  if (trimmed === "/tools summary" || trimmed === "/tools registry") {
    return JSON.stringify(
      {
        ...context.services.tools.summary(),
        nativePluginManager: getEffectivePluginManagerInventory(
          context.runtime,
        ),
      },
      null,
      2,
    );
  }

  if (trimmed === "/tools transports") {
    const summary = context.services.tools.summary();
    return summary.transports.length
      ? summary.transports
          .map(
            (entry) =>
              `- ${entry.transport}: enabled=${entry.enabled}/${entry.total}`,
          )
          .join("\n")
      : "No transport metadata available.";
  }

  if (trimmed.startsWith("/tools show ")) {
    const id = trimmed.replace("/tools show ", "").trim();
    if (!id) {
      return "Usage: /tools show <tool-id>";
    }
    return JSON.stringify(
      context.services.tools.get(id) ?? { error: `Tool not found: ${id}` },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/tools category ")) {
    const category = trimmed.replace("/tools category ", "").trim();
    if (!category) {
      return "Usage: /tools category <category>";
    }
    const tools = context.services.tools.byCategory(category);
    return tools.length
      ? tools
          .map(
            (tool) =>
              `- ${tool.id} [${tool.enabled ? "enabled" : "disabled"}] ${tool.description}`,
          )
          .join("\n")
      : `No tools found for category: ${category}`;
  }

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
    const payload = trimmed.replace("/mcp call ", "");
    const [toolName, inputRaw] = payload.split("::").map((part) => part.trim());
    if (!toolName) {
      return "Usage: /mcp call <toolName> :: <json-input>";
    }
    const parsedInput = inputRaw
      ? (JSON.parse(inputRaw) as Record<string, unknown>)
      : {};
    return JSON.stringify(
      await invokeEffectiveMcpTool(
        context.runtime,
        context.services,
        toolName,
        parsedInput,
      ),
      null,
      2,
    );
  }

  if (trimmed === "/acp" || trimmed === "/acp status") {
    return JSON.stringify(context.services.acp.status(), null, 2);
  }

  if (trimmed === "/acp registry") {
    return JSON.stringify(context.services.acp.registry(), null, 2);
  }

  if (trimmed === "/acp package") {
    return JSON.stringify(context.services.acp.packageMetadata(), null, 2);
  }

  if (trimmed === "/acp editor" || trimmed === "/acp install") {
    return JSON.stringify(context.services.acp.editorSummary(), null, 2);
  }

  if (trimmed === "/acp sessions") {
    return JSON.stringify(context.services.acp.sessionSummary(), null, 2);
  }

  if (trimmed === "/acp publish") {
    return JSON.stringify(context.services.acp.publishRegistry(), null, 2);
  }

  if (trimmed.startsWith("/acp export")) {
    const label = trimmed.replace("/acp export", "").trim() || "latest";
    return JSON.stringify(context.services.acp.exportBundle(label), null, 2);
  }

  if (trimmed.startsWith("/acp import ")) {
    const input = trimmed.replace("/acp import ", "").trim();
    if (!input) {
      return "Usage: /acp import <path-or-json>";
    }
    return JSON.stringify(context.services.acp.importBundle(input), null, 2);
  }

  if (trimmed === "/acp probe") {
    return JSON.stringify(await context.services.acp.probe(), null, 2);
  }

  if (trimmed === "/acp tools") {
    return JSON.stringify(context.services.acp.tools(), null, 2);
  }

  if (trimmed.startsWith("/acp search ")) {
    const query = trimmed.replace("/acp search ", "").trim();
    if (!query) {
      return "Usage: /acp search <query>";
    }
    return JSON.stringify(context.services.acp.searchTools(query), null, 2);
  }

  if (trimmed.startsWith("/acp describe ")) {
    const name = trimmed.replace("/acp describe ", "").trim();
    if (!name) {
      return "Usage: /acp describe <tool-name>";
    }
    return context.services.acp.describeTool(name);
  }

  if (trimmed.startsWith("/acp invoke ")) {
    const input = trimmed.replace("/acp invoke ", "").trim();
    return JSON.stringify(await context.services.acp.invoke(input), null, 2);
  }

  if (trimmed.startsWith("/acp call ")) {
    const payload = trimmed.replace("/acp call ", "");
    const [toolName, inputRaw] = payload.split("::").map((part) => part.trim());
    if (!toolName) {
      return "Usage: /acp call <toolName> :: <json-input>";
    }
    const parsedInput = inputRaw
      ? (JSON.parse(inputRaw) as Record<string, unknown>)
      : {};
    return JSON.stringify(
      await context.services.acp.invokeTool(toolName, parsedInput),
      null,
      2,
    );
  }

  return undefined;
}
