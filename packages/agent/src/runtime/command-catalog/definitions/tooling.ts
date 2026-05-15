import type { CommandCatalogEntry } from "../types";

export const ToolingCommandCatalogEntries: CommandCatalogEntry[] = [
  {
    command: "/tools",
    category: "tools",
    description: "List available Doolittle and native-backed tools.",
  },
  {
    command: "/tools search <query>",
    category: "tools",
    description: "Search available tools by name, category, or description.",
  },
  {
    command: "/tools summary",
    category: "tools",
    description: "Show tool transport and native plugin inventory summary.",
  },
  {
    command: "/mcp status",
    category: "tools",
    description: "Show local or native MCP readiness.",
  },
  {
    command: "/mcp tools",
    category: "tools",
    description: "Discover MCP tools through the configured MCP bridge.",
  },
  {
    command: "/mcp marketplace search <query>",
    category: "tools",
    description: "Search the native ElizaOS MCP marketplace.",
  },
  {
    command: "/mcp marketplace show <server-name>",
    category: "tools",
    description: "Show native MCP marketplace server details and config.",
  },
  {
    command: "/mcp call <toolName> :: <json-input>",
    category: "tools",
    description: "Invoke a cached MCP tool with JSON input.",
  },
  {
    command: "/acp status",
    category: "tools",
    description: "Show ACP bridge readiness.",
  },
  {
    command: "/acp registry",
    category: "tools",
    description: "Show the local ACP tool registry.",
  },
  {
    command: "/acp call <toolName> :: <json-input>",
    category: "tools",
    description: "Invoke a local ACP tool with JSON input.",
  },
];
