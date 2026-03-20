import type { ToolDefinition } from "@/types";

interface ToolRegistryDynamicState {
  mcpEnabled: boolean;
  discoveredMcpTools: number;
  discoveredMcpToolNames?: string[];
}

interface ToolRegistrySummary {
  total: number;
  enabled: number;
  disabled: number;
  transports: Array<{
    transport: string;
    total: number;
    enabled: number;
  }>;
  categories: Array<{
    category: string;
    total: number;
    enabled: number;
  }>;
  mcp: {
    enabled: boolean;
    discoveredTools: number;
    discoveredToolNames: string[];
  };
}

export class ToolsService {
  constructor(
    private readonly getDynamicState: () => ToolRegistryDynamicState = () => ({
      mcpEnabled: false,
      discoveredMcpTools: 0,
      discoveredMcpToolNames: [],
    }),
  ) {}

  private readonly tools: ToolDefinition[] = [
    {
      id: "workspace.tree",
      name: "Workspace Tree",
      category: "workspace",
      description: "List the current workspace tree.",
      enabled: true,
      transport: "service",
    },
    {
      id: "workspace.read",
      name: "Workspace Read",
      category: "workspace",
      description: "Read a file from the configured workspace.",
      enabled: true,
      transport: "service",
    },
    {
      id: "workspace.search",
      name: "Workspace Search",
      category: "workspace",
      description: "Search across workspace files.",
      enabled: true,
      transport: "service",
    },
    {
      id: "terminal.run",
      name: "Terminal Run",
      category: "terminal",
      description: "Execute a command on the active execution backend.",
      enabled: true,
      transport: "service",
    },
    {
      id: "repository.status",
      name: "Repository Status",
      category: "repository",
      description: "Inspect git status for the current repository.",
      enabled: true,
      transport: "service",
    },
    {
      id: "documents.pdf.extract",
      name: "PDF Extract",
      category: "documents",
      description: "Extract text from PDF files through the PDF service.",
      enabled: true,
      transport: "service",
    },
    {
      id: "web.fetch",
      name: "Web Fetch",
      category: "documents",
      description: "Fetch and extract readable text from a URL through the configured browser backend.",
      enabled: true,
      transport: "service",
    },
    {
      id: "browser.status",
      name: "Browser Status",
      category: "documents",
      description: "Inspect the configured browser automation backend.",
      enabled: true,
      transport: "service",
    },
    {
      id: "browser.snapshot",
      name: "Browser Snapshot",
      category: "documents",
      description: "Create a text snapshot artifact for a URL.",
      enabled: true,
      transport: "service",
    },
    {
      id: "browser.screenshot",
      name: "Browser Screenshot",
      category: "documents",
      description: "Create a lightweight screenshot artifact placeholder for a URL.",
      enabled: true,
      transport: "service",
    },
    {
      id: "browser.capture",
      name: "Browser Capture Bundle",
      category: "documents",
      description: "Create a reusable bundle with snapshot, screenshot, report, and manifest artifacts for a URL.",
      enabled: true,
      transport: "service",
    },
    {
      id: "media.inspect",
      name: "Media Inspect",
      category: "documents",
      description: "Inspect local media files for type and size metadata.",
      enabled: true,
      transport: "service",
    },
    {
      id: "gateway.send",
      name: "Gateway Send",
      category: "gateway",
      description: "Send a response through the active gateway adapter.",
      enabled: true,
      transport: "adapter",
    },
    {
      id: "automation.cron",
      name: "Cron Automation",
      category: "automation",
      description: "Create and inspect scheduled automation jobs.",
      enabled: true,
      transport: "service",
    },
    {
      id: "automation.trajectory.export",
      name: "Trajectory Export",
      category: "automation",
      description: "Export recent interaction trajectories to JSONL.",
      enabled: true,
      transport: "service",
    },
    {
      id: "skills.synthesize",
      name: "Skill Synthesis",
      category: "automation",
      description: "Create draft reusable skills from completed delegated work.",
      enabled: true,
      transport: "service",
    },
    {
      id: "mcp.bridge",
      name: "MCP Bridge",
      category: "mcp",
      description: "Structured MCP bridge for tool discovery and invocation.",
      enabled: true,
      transport: "native",
    },
  ];

  list(): ToolDefinition[] {
    const dynamic = this.getDynamicState();
    return this.tools.map((tool) =>
      tool.id === "mcp.bridge"
        ? {
            ...tool,
            enabled: dynamic.mcpEnabled,
            description: dynamic.mcpEnabled
              ? `Structured MCP bridge enabled with ${dynamic.discoveredMcpTools} discovered tool(s)${
                  dynamic.discoveredMcpToolNames?.length
                    ? `: ${dynamic.discoveredMcpToolNames.slice(0, 5).join(", ")}`
                    : ""
                }.`
              : "Structured MCP bridge is available but not configured.",
        }
        : tool,
    );
  }

  enabled(): ToolDefinition[] {
    return this.list().filter((tool) => tool.enabled);
  }

  search(query: string): ToolDefinition[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return this.list();
    }
    return this.list().filter((tool) =>
      [tool.id, tool.name, tool.category, tool.description, tool.transport ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }

  get(id: string): ToolDefinition | undefined {
    return this.list().find((tool) => tool.id === id);
  }

  byCategory(category: string): ToolDefinition[] {
    return this.list().filter((tool) => tool.category === category);
  }

  grouped(): Record<string, ToolDefinition[]> {
    return this.list().reduce<Record<string, ToolDefinition[]>>((groups, tool) => {
      groups[tool.category] ??= [];
      groups[tool.category].push(tool);
      return groups;
    }, {});
  }

  summary(): ToolRegistrySummary {
    const tools = this.list();
    const enabled = tools.filter((tool) => tool.enabled);
    const transportMap = tools.reduce<Map<string, ToolDefinition[]>>((map, tool) => {
      const key = tool.transport ?? "service";
      map.set(key, [...(map.get(key) ?? []), tool]);
      return map;
    }, new Map());
    const transports = Array.from(transportMap.entries()).map(([transport, entries]) => ({
      transport,
      total: entries.length,
      enabled: entries.filter((tool) => tool.enabled).length,
    }));
    const categories = Object.entries(this.grouped()).map(([category, entries]) => ({
      category,
      total: entries.length,
      enabled: entries.filter((tool) => tool.enabled).length,
    }));
    const dynamic = this.getDynamicState();
    return {
      total: tools.length,
      enabled: enabled.length,
      disabled: tools.length - enabled.length,
      transports,
      categories,
      mcp: {
        enabled: dynamic.mcpEnabled,
        discoveredTools: dynamic.discoveredMcpTools,
        discoveredToolNames: dynamic.discoveredMcpToolNames ?? [],
      },
    };
  }
}
