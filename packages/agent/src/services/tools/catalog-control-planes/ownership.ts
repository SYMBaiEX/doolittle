import type { ToolDefinition } from "@/types";

export const OWNERSHIP_CONTROL_PLANES = [
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
    id: "runtime.ownership",
    name: "Ownership Snapshot",
    category: "runtime",
    description:
      "Inspect the shared native ownership snapshot across control plane, integration, autonomous, and skill hub surfaces.",
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
] as const satisfies readonly ToolDefinition[];
