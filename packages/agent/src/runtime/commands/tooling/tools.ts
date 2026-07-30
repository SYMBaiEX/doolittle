import {
  getEffectivePluginManagerInventory,
  getEffectiveToolInventory,
  searchEffectiveTools,
} from "@/runtime/native/service-bridge/service-resolution";
import type { AgentExecutionContext } from "../../chat";

export async function handleToolsCommand(
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed === "/tools" || trimmed === "/tools list") {
    const pluginInventory = getEffectivePluginManagerInventory(context.runtime);
    const inventory = getEffectiveToolInventory(
      context.runtime,
      context.services,
    );
    const toolLines = inventory.tools.map(
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
    const tools = searchEffectiveTools(
      context.runtime,
      context.services,
      query,
    );
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
    const inventory = getEffectiveToolInventory(
      context.runtime,
      context.services,
    );
    return JSON.stringify(
      {
        ...inventory.summary,
        nativePluginManager: getEffectivePluginManagerInventory(
          context.runtime,
        ),
      },
      null,
      2,
    );
  }

  if (trimmed === "/tools transports") {
    const summary = getEffectiveToolInventory(
      context.runtime,
      context.services,
    ).summary;
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
    const inventory = getEffectiveToolInventory(
      context.runtime,
      context.services,
    );
    return JSON.stringify(
      inventory.tools.find(
        (tool) =>
          tool.id.toLowerCase() === id.toLowerCase() ||
          tool.name.toLowerCase() === id.toLowerCase(),
      ) ?? { error: `Tool not found: ${id}` },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/tools category ")) {
    const category = trimmed.replace("/tools category ", "").trim();
    if (!category) {
      return "Usage: /tools category <category>";
    }
    const tools = getEffectiveToolInventory(
      context.runtime,
      context.services,
    ).tools.filter(
      (tool) => tool.category.toLowerCase() === category.toLowerCase(),
    );
    return tools.length
      ? tools
          .map(
            (tool) =>
              `- ${tool.id} [${tool.enabled ? "enabled" : "disabled"}] ${tool.description}`,
          )
          .join("\n")
      : `No tools found for category: ${category}`;
  }

  return undefined;
}
