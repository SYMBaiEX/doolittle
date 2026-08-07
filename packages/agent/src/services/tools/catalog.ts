import type { ToolDefinition } from "@/types";
import { TOOL_CONTROL_PLANE_CATALOG } from "./catalog-control-planes";
import { TOOL_DOCUMENT_CATALOG } from "./catalog-documents";

/**
 * Static tool definition catalog. Each entry describes a tool available in the
 * Doolittle agent runtime with its default (static) description.
 */
export const TOOL_CATALOG: readonly ToolDefinition[] = [
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
    id: "forms.native",
    name: "Doolittle Forms",
    category: "runtime",
    description:
      "Inspect, create, and manage Doolittle forms through their Eliza runtime service.",
    enabled: true,
    transport: "service",
  },
  {
    id: "e2b.native",
    name: "Doolittle Local Sandbox",
    category: "runtime",
    description:
      "Create, inspect, and execute Doolittle's E2B-style local sandboxes through the Eliza runtime.",
    enabled: true,
    transport: "service",
  },
  {
    id: "codegen.native",
    name: "Doolittle Code Planning",
    category: "runtime",
    description:
      "Invoke Doolittle's experimental planning, GitHub, and secrets-backed autocoder workflows.",
    enabled: true,
    transport: "service",
  },
  {
    id: "github.native",
    name: "Doolittle Autocoder GitHub",
    category: "runtime",
    description:
      "Manage GitHub repository creation and deletion for Doolittle autocoder workflows.",
    enabled: true,
    transport: "service",
  },
  {
    id: "secrets.native",
    name: "Doolittle Autocoder Secrets",
    category: "runtime",
    description:
      "Inspect and manage encrypted global keys through Eliza's native secrets service.",
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
  ...TOOL_DOCUMENT_CATALOG,
  ...TOOL_CONTROL_PLANE_CATALOG,
] as const satisfies readonly ToolDefinition[];

/** Number of static catalog entries — useful for test assertions. */
export const TOOL_CATALOG_SIZE = TOOL_CATALOG.length;
