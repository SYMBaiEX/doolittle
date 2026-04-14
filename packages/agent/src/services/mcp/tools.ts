import type { McpToolDefinition } from "@/types";

export function parseStructuredMcpTools(raw: string): McpToolDefinition[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .flatMap((entry) => {
        if (
          entry &&
          typeof entry === "object" &&
          "tools" in entry &&
          Array.isArray((entry as Record<string, unknown>).tools)
        ) {
          return (entry as Record<string, unknown>).tools as Record<
            string,
            unknown
          >[];
        }
        return [entry];
      })
      .filter((entry) => entry && typeof entry === "object" && "name" in entry)
      .map((entry) => ({
        name: String((entry as Record<string, unknown>).name),
        description: String(
          (entry as Record<string, unknown>).description ??
            "MCP-discovered tool.",
        ),
        inputSchema:
          typeof (entry as Record<string, unknown>).inputSchema === "object"
            ? ((entry as Record<string, unknown>).inputSchema as Record<
                string,
                unknown
              >)
            : undefined,
      }));
  } catch {
    return [];
  }
}

export function parseLineOrientedMcpTools(raw: string): McpToolDefinition[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ...descriptionParts] = line.split(" - ");
      return {
        name,
        description: descriptionParts.join(" - ") || "MCP-discovered tool.",
      } satisfies McpToolDefinition;
    });
}

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
    [tool.name, tool.description, JSON.stringify(tool.inputSchema ?? {})]
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
    tool.description ? `Description: ${tool.description}` : undefined,
    tool.inputSchema
      ? `Schema: ${JSON.stringify(tool.inputSchema, null, 2)}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}
