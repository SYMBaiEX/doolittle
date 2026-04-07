import type { ToolDefinition } from "@/types";

export const TOOL_CONTROL_PLANE_CATALOG = [
  {
    id: "gateway.send",
    name: "Gateway Send",
    category: "gateway",
    description: "Send a response through the active gateway adapter.",
    enabled: true,
    transport: "adapter",
  },
  {
    id: "acp.status",
    name: "ACP Status",
    category: "protocol",
    description: "Inspect the ACP bridge and Doolittle registry surface.",
    enabled: true,
    transport: "service",
  },
  {
    id: "acp.registry",
    name: "ACP Registry",
    category: "protocol",
    description:
      "Publish the Doolittle ACP registry manifest for editor integrations.",
    enabled: true,
    transport: "service",
  },
  {
    id: "acp.package",
    name: "ACP Package Metadata",
    category: "protocol",
    description:
      "Inspect ACP package metadata, workspace packaging, and registry identity.",
    enabled: true,
    transport: "service",
  },
  {
    id: "acp.editor",
    name: "ACP Editor Summary",
    category: "protocol",
    description:
      "Inspect ACP editor install, registry, export, and import integration details.",
    enabled: true,
    transport: "service",
  },
  {
    id: "acp.sessions",
    name: "ACP Session Summary",
    category: "protocol",
    description:
      "Expose ACP-visible session counts, recent session ids, and titled session summaries.",
    enabled: true,
    transport: "service",
  },
  {
    id: "acp.export",
    name: "ACP Export",
    category: "protocol",
    description:
      "Export ACP package, registry, session, and tool metadata into a reusable bundle.",
    enabled: true,
    transport: "service",
  },
  {
    id: "acp.import",
    name: "ACP Import",
    category: "protocol",
    description:
      "Import ACP bundle metadata from a file path or JSON payload into the local ACP workspace.",
    enabled: true,
    transport: "service",
  },
  {
    id: "acp.tools",
    name: "ACP Tool Catalog",
    category: "protocol",
    description:
      "Expose Doolittle tools as ACP-style tool definitions with kind metadata.",
    enabled: true,
    transport: "service",
  },
  {
    id: "plugins.native",
    name: "Native Plugin Inventory",
    category: "runtime",
    description:
      "Inspect the native ElizaOS plugin catalog, grouped categories, and service registry alignment.",
    enabled: true,
    transport: "native",
  },
  {
    id: "packages.native",
    name: "Native Package Audit",
    category: "runtime",
    description:
      "Inspect latest-line ElizaOS package compatibility across official, alpha-only, vendored, and workspace-bound packages.",
    enabled: true,
    transport: "native",
  },
  {
    id: "ecosystem.workspace",
    name: "Ecosystem Workspace",
    category: "runtime",
    description:
      "Inspect Doolittle benchmark packs, distribution channels, and modeling profiles published through the workspace.",
    enabled: true,
    transport: "service",
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
    id: "automation.trajectory.analyze",
    name: "Trajectory Analyze",
    category: "automation",
    description:
      "Create a model-backed research brief from a trajectory bundle.",
    enabled: true,
    transport: "service",
  },
  {
    id: "automation.trajectory.evaluate",
    name: "Trajectory Evaluate",
    category: "automation",
    description:
      "Score a trajectory bundle and emit a research evaluation report.",
    enabled: true,
    transport: "service",
  },
  {
    id: "automation.trajectory.package",
    name: "Trajectory Package",
    category: "automation",
    description:
      "Package export, replay, analysis, and evaluation artifacts into a reusable research bundle.",
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
  {
    id: "runtime.registry",
    name: "Registry Snapshot",
    category: "runtime",
    description:
      "Inspect the ElizaOS registry client snapshot and endpoint state.",
    enabled: true,
    transport: "native",
  },
  {
    id: "runtime.compatibility",
    name: "Compatibility Report",
    category: "runtime",
    description:
      "Inspect plugin-to-core compatibility results from the Eliza agent SDK.",
    enabled: true,
    transport: "native",
  },
  {
    id: "runtime.autonomous",
    name: "Autonomous Control Plane",
    category: "runtime",
    description:
      "Inspect native Eliza agent-skills, orchestrator, trajectory, and plugin-manager adoption.",
    enabled: true,
    transport: "native",
  },
  {
    id: "runtime.ownership",
    name: "Ownership Snapshot",
    category: "runtime",
    description:
      "Inspect the shared native ownership snapshot across control plane, integration, autonomous, and skill hub surfaces.",
    enabled: true,
    transport: "native",
  },
  {
    id: "skills.catalog",
    name: "Skill Catalog",
    category: "runtime",
    description:
      "Inspect the ElizaOS skill catalog cache and trending skill metadata.",
    enabled: true,
    transport: "native",
  },
  {
    id: "skills.hub",
    name: "Skill Hub",
    category: "runtime",
    description:
      "Inspect the native Eliza skill hub summary, installed manifests, and distribution sync state.",
    enabled: true,
    transport: "native",
  },
  {
    id: "skills.families",
    name: "Skill Families",
    category: "runtime",
    description:
      "Inspect curated and generated Eliza skill families with workspace, catalog, and install coverage.",
    enabled: true,
    transport: "native",
  },
  {
    id: "skills.family",
    name: "Skill Family",
    category: "runtime",
    description:
      "Inspect a single skill family by slug for detailed hub coverage.",
    enabled: true,
    transport: "native",
  },
  {
    id: "skills.installed",
    name: "Installed Skills",
    category: "runtime",
    description:
      "Inspect installed skill manifests and their distribution metadata.",
    enabled: true,
    transport: "native",
  },
  {
    id: "skills.export",
    name: "Skill Export",
    category: "runtime",
    description: "Export a workspace or catalog skill manifest.",
    enabled: true,
    transport: "native",
  },
  {
    id: "skills.import",
    name: "Skill Import",
    category: "runtime",
    description: "Import a manifest into the local Eliza skill hub.",
    enabled: true,
    transport: "native",
  },
  {
    id: "skills.install",
    name: "Skill Install",
    category: "runtime",
    description: "Install a catalog skill into the local Eliza skill hub.",
    enabled: true,
    transport: "native",
  },
] as const satisfies readonly ToolDefinition[];
