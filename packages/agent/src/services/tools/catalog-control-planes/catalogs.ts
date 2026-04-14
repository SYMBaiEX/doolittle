import type { ToolDefinition } from "@/types";

export const ACP_CATALOG_CONTROL_PLANES = [
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
] as const satisfies readonly ToolDefinition[];

export const RUNTIME_CATALOG_CONTROL_PLANES = [
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
] as const satisfies readonly ToolDefinition[];

export const SKILL_CATALOG_CONTROL_PLANES = [
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
