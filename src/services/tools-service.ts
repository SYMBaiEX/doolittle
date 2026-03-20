import type { ToolDefinition } from "@/types";

export class ToolsService {
  constructor(
    private readonly getDynamicState: () => {
      mcpEnabled: boolean;
      discoveredMcpTools: number;
    } = () => ({ mcpEnabled: false, discoveredMcpTools: 0 }),
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
              ? `Structured MCP bridge enabled with ${dynamic.discoveredMcpTools} discovered tool(s).`
              : "Structured MCP bridge is available but not configured.",
          }
        : tool,
    );
  }

  enabled(): ToolDefinition[] {
    return this.list().filter((tool) => tool.enabled);
  }
}
