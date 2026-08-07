import type { McpToolDefinition } from "@/types";

export function findCachedMcpTool(
  tools: McpToolDefinition[],
  name: string,
): McpToolDefinition | undefined {
  return tools.find((tool) => tool.name === name);
}

export function searchCachedMcpTools(
  tools: McpToolDefinition[],
  query: string,
): McpToolDefinition[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [...tools];
  }
  return tools.filter((tool) =>
    [
      tool.name,
      tool.serverName,
      tool.toolName,
      tool.description,
      JSON.stringify(tool.inputSchema ?? {}),
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalized),
  );
}

export function describeCachedMcpTools(
  tools: McpToolDefinition[],
  limit = 20,
): string {
  return tools.slice(0, limit).length
    ? tools
        .slice(0, limit)
        .map(
          (tool) =>
            `- ${tool.name}${tool.description ? `\n  ${tool.description}` : ""}${
              tool.inputSchema
                ? `\n  schema=${JSON.stringify(tool.inputSchema)}`
                : ""
            }`,
        )
        .join("\n\n")
    : "No MCP tools have been cached yet.";
}

export function describeCachedMcpTool(
  tool: McpToolDefinition | undefined,
  name: string,
): string {
  if (!tool) {
    return `Tool not found: ${name}`;
  }
  return [
    `MCP TOOL: ${tool.name}`,
    `Server: ${tool.serverName}`,
    tool.description ? `Description: ${tool.description}` : undefined,
    tool.inputSchema
      ? `Schema: ${JSON.stringify(tool.inputSchema, null, 2)}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}
